'use strict';

const EventEmitter = require('events').EventEmitter;
const _ = require('lodash');
const async = require('async');
const debug = require('debug')('runner');
const arrivals = require('arrivals');
const Measured = require('measured');
const Stats = require('./stats');
const JSCK = require('jsck');

const Engines = {
  http: require('./engine_http'),
  ws: require('./engine_ws')
};

JSCK.Draft4 = JSCK.draft4;

const schema = new JSCK.Draft4(require('./schemas/minigun_test_script.json'));

module.exports = {
  runner: runner,
  validate: validate
};

// Only one runner can execute at a time when used as a library.

let pendingRequests = new Measured.Counter();
let pendingScenarios = new Measured.Counter();
let cancelledRequests = new Measured.Counter();

let compiledScenarios;
let scenarioEvents;

let Report = {
  intermediate: [],
  aggregate: {}
};

let plugins = [];

function validate(script) {
  let validation = schema.validate(script);
  return validation;
}

function runner(script, payload, options) {

  let opts = _.assign({
    periodicStats: script.config.statsInterval || 10,
    mode: script.config.mode || 'poisson'
  },
  options);

  if (payload) {
    script.config.payload.data = payload;
  }

  let runnableScript = _.cloneDeep(script);

  if (opts.environment) {
    _.merge(
      runnableScript.config,
      script.config.environments[opts.environment]);
  }

  compiledScenarios = null;
  scenarioEvents = null;

  let ee = new EventEmitter();

  //
  // load plugins:
  //
  plugins = _.map(script.config.plugins,
    function loadPlugin(pluginConfig, pluginName) {
      let moduleName = 'minigun-plugin-' + pluginName;
      try {
        let Plugin = require(moduleName);
        let plugin = new Plugin(script.config, ee);
        plugin.__name = pluginName;
        return plugin;
      } catch (e) {
        console.log(
          'WARNING: plugin %s specified but module %s could not be loaded',
          pluginName,
          moduleName);
      }
    });

  ee.run = function() {
    run(runnableScript, ee, opts);
  };
  return ee;
}

function run(script, ee, options) {

  let intermediate = Stats.create();
  let aggregate = Stats.create();

  let phases = _.map(script.config.phases, function(phaseSpec, i) {

    let task = function(callback) {

      ee.emit('phaseStarted', {
        index: i,
        name: phaseSpec.name,
        duration: phaseSpec.duration
      });
      const ar = 1000 / phaseSpec.arrivalRate;
      const ppStartedAt = process.hrtime();
      const pp = arrivals[options.mode].process(ar, phaseSpec.duration * 1000);
      pp.on('arrival', function onArrival() {
        runScenario(script, intermediate, aggregate);
      });
      pp.on('finished', function onFinished() {
        ee.emit('phaseCompleted', {
          index: i,
          name: phaseSpec.name,
          duration: phaseSpec.duration
        });
        const ppStoppedAt = process.hrtime(ppStartedAt);
        const ppRanFor = (ppStoppedAt[0] * 1e9) + ppStoppedAt[1];
        return callback(null);
      });
      pp.start();
    };

    return task;
  });

  const periodicStatsTimer = setInterval(function() {

    const report = intermediate.report();
    Report.intermediate.push(report);
    intermediate.reset();
    ee.emit('stats', report);
  }, options.periodicStats * 1000);

  async.series(phases, function(err) {

    if (err) {
      debug(err);
    }

    debug('All phases launched');

    const doneYet = setInterval(function () {
      if (pendingScenarios.toJSON() === 0) {
        if (pendingRequests.toJSON() !== 0) {
          debug('DONE. Pending requests: %s', pendingRequests.toJSON());
        }

        Report.aggregate = aggregate.report();
        clearInterval(doneYet);
        clearInterval(periodicStatsTimer);
        intermediate.free();
        aggregate.free();

        //
        // Add plugin reports to the final report
        //
        _.each(plugins, function(plugin) {
          if (typeof plugin.report === 'function') {
            let report = plugin.report();
            if (report) {
              if (report.length) {
                _.each(report, function insertIntermediateReport(a) {
                  if (a.timestamp === 'aggregate') {
                    Report.aggregate[plugin.__name] = a.value;
                  } else {
                    let ir = _.findWhere(
                      Report.intermediate,
                      {timestamp: a.timestamp});
                    ir[plugin.__name] = a.value;
                  }
                });
              } else {
                Report.aggregate[plugin.__name] = report;
              }
            }
          }
        });

        return ee.emit('done', Report);
      } else {
        debug('Pending requests: %s', pendingRequests.toJSON());
        debug('Pending scenarios: %s', pendingScenarios.toJSON());
      }
    }, 500);
  });
}

function runScenario(script, intermediate, aggregate) {
  //
  // Compile scenarios if needed
  //
  if (!compiledScenarios) {
    scenarioEvents = new EventEmitter();
    scenarioEvents.on('started', function() {
      pendingScenarios.inc();
    });
    scenarioEvents.on('error', function(errCode) {
      intermediate.addError(errCode);
      aggregate.addError(errCode);
    });
    scenarioEvents.on('request', function() {
      intermediate.newRequest();
      aggregate.newRequest();

      pendingRequests.inc();
    });
    scenarioEvents.on('match', function() {
      intermediate.addMatch();
      aggregate.addMatch();
    });
    scenarioEvents.on('response', function(delta, code) {
      intermediate.completedRequest();
      intermediate.addLatency(delta);
      intermediate.addCode(code);

      aggregate.completedRequest();
      aggregate.addLatency(delta);
      aggregate.addCode(code);

      pendingRequests.dec();
    });

    compiledScenarios = _.map(script.scenarios, function(scenarioSpec) {
      const engine = scenarioSpec.engine || 'http';
      return Engines[engine].compile(
        scenarioSpec.flow,
        script.config,
        scenarioEvents);
    });
  }

  intermediate.newScenario();
  aggregate.newScenario();

  const scenarioStartedAt = process.hrtime();
  let i = _.random(0, compiledScenarios.length - 1);
  compiledScenarios[i](createContext(script), function(err, context) {
    pendingScenarios.dec();
    if (err) {
      debug(err);
      //debug('Scenario aborted due to error');
      cancelledRequests.inc(context._pendingRequests);
    } else {
      //debug('Scenario completed');
      //debug(context);
      const scenarioFinishedAt = process.hrtime(scenarioStartedAt);
      const delta = (scenarioFinishedAt[0] * 1e9) + scenarioFinishedAt[1];
      intermediate.addScenarioLatency(delta);
      aggregate.addScenarioLatency(delta);
      intermediate.completedScenario();
      aggregate.completedScenario();
    }
  });
}

/**
 * Create initial context for a scenario.
 */
function createContext(script) {
  const INITIAL_CONTEXT = {
    vars: {
      target: script.config.target
    },
    funcs: {
      $randomNumber: $randomNumber,
      $randomString: $randomString
    }
  };
  let result = _.cloneDeep(INITIAL_CONTEXT);
  if (script.config.payload && script.config.payload.data) {
    let i = _.random(0, script.config.payload.data.length - 1);
    let row = script.config.payload.data[i];
    _.each(script.config.payload.fields, function(fieldName, j) {
      result.vars[fieldName] = row[j];
    });
  }
  if (script.config.variables) {
    _.each(script.config.variables, function(v, k) {
      let val;
      if (_.isArray(v)) {
        val = _.sample(v);
      } else {
        val = v;
      }
      result.vars[k] = val;
    });
  }
  return result;
}

/**
 * Returns a scenario picked at random from a list of scenarios.
 */
function pickScenario(scenarios) {
  return scenarios[_.random(0, scenarios.length - 1)];
}

//
// Generator functions for template strings:
//
function $randomNumber(min, max) {
  return _.random(min, max);
}

function $randomString(length) {
  return Math.random().toString(36).substr(2, length);
}
