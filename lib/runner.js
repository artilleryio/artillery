'use strict';

const EventEmitter = require('events').EventEmitter;
const _ = require('lodash');
const debug = require('debug')('runner');
const debugPerf = require('debug')('perf');
const Measured = require('measured');
const Stats = require('./stats');
const JSCK = require('jsck');
const createPhaser = require('./phases');
const engineUtil = require('./engine_util');
const wl = require('./weighted-pick');

const Engines = {
  http: {},
  ws: {}
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
let picker;

let Report = {
  intermediate: [],
  aggregate: {}
};

let plugins = [];
let engines = [];

function validate(script) {
  let validation = schema.validate(script);
  return validation;
}

function runner(script, payload, options) {

  let opts = _.assign({
    periodicStats: script.config.statsInterval || 10,
    mode: script.config.mode || 'uniform'
  },
  options);

  _.each(script.config.phases, function(phaseSpec) {
    phaseSpec.mode = phaseSpec.mode || script.config.mode;
  });

  if (payload) {
    if (_.isArray(payload[0])) {
      script.config.payload = [
        {
          fields: script.config.payload.fields,
          data: payload
        }
      ];
    } else {
      script.config.payload = payload;
    }
  } else {
    script.config.payload = null;
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
  // load engines:
  //
  engines = _.map(Object.assign({}, Engines, script.config.engines),
    function loadEngine(engineConfig, engineName) {
      let moduleName = 'minigun-engine-' + engineName;
      try {
        if (Engines[engineName]) {
          moduleName = './engine_' + engineName;
        }
        let Engine = require(moduleName);
        let engine = new Engine(script.config, ee);
        engine.__name = engineName;
        return engine;
      } catch (e) {
        console.log(
          'WARNING: engine %s specified but module %s could not be loaded',
          engineName,
          moduleName);
      }
    });

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

  let phaser = createPhaser(script.config.phases);
  phaser.on('arrival', function() {
    runScenario(script, intermediate, aggregate);
  });
  phaser.on('phaseStarted', function(spec) {
    ee.emit('phaseStarted', spec);
  });
  phaser.on('phaseCompleted', function(spec) {
    ee.emit('phaseCompleted', spec);
  });
  phaser.on('done', function() {
    debug('All phases launched');

    const doneYet = setInterval(function checkIfDone() {
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

  const periodicStatsTimer = setInterval(function() {
    const report = intermediate.report();
    Report.intermediate.push(report);
    intermediate.reset();
    ee.emit('stats', report);
  }, options.periodicStats * 1000);

  phaser.run();
}

function runScenario(script, intermediate, aggregate) {
  const start = process.hrtime();

  //
  // Compile scenarios if needed
  //
  if (!compiledScenarios) {
    _.each(script.scenarios, function(scenario) {
      if (!scenario.weight) {
        scenario.weight = 1;
      }
    });

    picker = wl(script.scenarios);

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
      const name = scenarioSpec.engine || 'http';
      const engine = engines.find((e) => e.__name === name);
      let tasks = _.map(scenarioSpec.flow, rs => {
        if (rs.think) {
          return engineUtil.createThink(rs);
        }
        return engine.step(rs, scenarioEvents);
      });
      return engine.compile(
        tasks,
        scenarioSpec.flow,
        scenarioEvents
        );
    });
  }

  intermediate.newScenario();
  aggregate.newScenario();

  let i = picker()[0];

  debug('picking scenario %s (%s) weight = %s',
        i,
        script.scenarios[i].name,
        script.scenarios[i].weight);

  const scenarioStartedAt = process.hrtime();
  const scenarioContext = createContext(script);
  const finish = process.hrtime(start);
  const runScenarioDelta = (finish[0] * 1e9) + finish[1];
  debugPerf('runScenarioDelta: %s', Math.round(runScenarioDelta / 1e6 * 100) / 100);
  compiledScenarios[i](scenarioContext, function(err, context) {
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

  //
  // variables from payloads
  //
  if (script.config.payload) {
    _.each(script.config.payload, function(el) {
      let i = _.random(0, el.data.length - 1);
      let row = el.data[i];
      _.each(el.fields, function(fieldName, j) {
        result.vars[fieldName] = row[j];
      });
    });
  }

  //
  // inline variables
  //
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

//
// Generator functions for template strings:
//
function $randomNumber(min, max) {
  return _.random(min, max);
}

function $randomString(length) {
  return Math.random().toString(36).substr(2, length);
}
