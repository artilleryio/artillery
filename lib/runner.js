'use strict';

var EventEmitter = require('events').EventEmitter;
var _ = require('lodash');
var async = require('async');
var debug = require('debug')('runner');
var arrivals = require('arrivals');
var Measured = require('measured');
var Statham = require('./stats');
var JSCK = require('jsck');

var Workers = {
  http: require('./worker_http'),
  ws: require('./worker_ws')
};

JSCK.Draft4 = JSCK.draft4;

var schema = new JSCK.Draft4(require('./schemas/minigun_test_script.json'));

module.exports = {
  runner: runner,
  validate: validate
};

// Only one runner can execute at a time when used as a library.

var pendingRequests = new Measured.Counter();
var pendingScenarios = new Measured.Counter();
var cancelledRequests = new Measured.Counter();

var compiledScenarios;
var scenarioEvents;

var Report = {
  intermediate: [],
  aggregate: {}
};

var plugins = [];

function validate(script) {
  var validation = schema.validate(script);
  return validation;
}

function runner(script, payload, options) {

  var opts = _.assign({
    periodicStats: script.config.statsInterval || 10,
    mode: script.config.mode || 'poisson'
  },
  options);

  if (payload) {
    script.config.payload.data = payload;
  }

  var runnableScript = _.cloneDeep(script);

  if (opts.environment) {
    _.merge(
      runnableScript.config,
      script.config.environments[opts.environment]);
  }

  compiledScenarios = null;
  scenarioEvents = null;

  var ee = new EventEmitter();

  //
  // load plugins:
  //
  plugins = _.map(script.config.plugins,
    function loadPlugin(pluginConfig, pluginName) {
      try {
        var moduleName = 'minigun-plugin-' + pluginName;
        var Plugin = require(moduleName);
        var plugin = new Plugin(script.config, ee);
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

  var intermediate = Statham.create();
  var aggregate = Statham.create();

  var phases = _.map(script.config.phases, function(phaseSpec, i) {

    var task = function(callback) {

      ee.emit('phaseStarted', {
        index: i,
        name: phaseSpec.name,
        duration: phaseSpec.duration
      });
      var ar = 1000 / phaseSpec.arrivalRate;
      //debug('ar = %s', ar);
      var ppStartedAt = process.hrtime();
      var pp = arrivals[options.mode].process(ar, phaseSpec.duration * 1000);
      pp.on('arrival', function() {
        runScenario(script, intermediate, aggregate);
      });
      pp.on('finished', function() {
        ee.emit('phaseCompleted', {
          index: i,
          name: phaseSpec.name,
          duration: phaseSpec.duration
        });
        var ppStoppedAt = process.hrtime(ppStartedAt);
        var ppRanFor = (ppStoppedAt[0] * 1e9) + ppStoppedAt[1];
        debug('Arrival process ran for %s', ppRanFor / 1e6);
        return callback(null);
      });
      pp.start();
    };

    return task;
  });

  var periodicStatsTimer = setInterval(function() {

    var report = intermediate.report();
    Report.intermediate.push(report);
    intermediate.reset();
    ee.emit('stats', report);
  }, options.periodicStats * 1000);

  async.series(phases, function(err) {

    if (err) {
      debug(err);
    }

    debug('All phases launched');

    var doneYet = setInterval(function() {
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
            var report = plugin.report();
            if (report) {
              if (report.length) {
                _.each(report, function insertIntermediateReport(a) {
                  if (a.timestamp === 'aggregate') {
                    Report.aggregate[plugin.__name] = a.value;
                  } else {
                    var ir = _.findWhere(
                      Report.intermediate,
                      { timestamp: a.timestamp });
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
      var engine = scenarioSpec.engine || 'http';
      return Workers[engine].compile(
        scenarioSpec.flow,
        script.config,
        scenarioEvents);
    });
  }

  intermediate.newScenario();
  aggregate.newScenario();

  var scenarioStartedAt = process.hrtime();
  var i = _.random(0, compiledScenarios.length - 1);
  compiledScenarios[i](createContext(script), function(err, context) {
    pendingScenarios.dec();
    if (err) {
      debug(err);
      //debug('Scenario aborted due to error');
      cancelledRequests.inc(context._pendingRequests);
    } else {
      //debug('Scenario completed');
      //debug(context);
      var scenarioFinishedAt = process.hrtime(scenarioStartedAt);
      var delta = (scenarioFinishedAt[0] * 1e9) + scenarioFinishedAt[1];
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
  var INITIAL_CONTEXT = {
    vars: {},
    funcs: {
      $randomNumber: $randomNumber,
      $randomString: $randomString
    }
  };
  var result = _.cloneDeep(INITIAL_CONTEXT);
  if (script.config.payload && script.config.payload.data) {
    var i = _.random(0, script.config.payload.data.length - 1);
    var row = script.config.payload.data[i];
    _.each(script.config.payload.fields, function(fieldName, j) {

      result.vars[fieldName] = row[j];
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
