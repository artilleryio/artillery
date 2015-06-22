'use strict';

var EE = require('events').EventEmitter;
var _ = require('lodash');
var async = require('async');
var debug = require('debug')('runner');
var arrivals = require('./arrivals');
var Measured = require('measured');
var Statham = require('./stats');

var Workers = {
  http: require('./worker_http'),
  ws: require('./worker_ws')
};

module.exports = runner;

var pendingRequests = new Measured.Counter();
var pendingScenarios = new Measured.Counter();
var cancelledRequests = new Measured.Counter();

var Report = {
  intermediate: [],
  aggregate: {}
};

function runner(script, payload, options) {

  var opts = _.assign({
    periodicStats: 10,
    mode: script.config.mode || 'poission'
  },
  options);

  if (payload) {
    script.config.payload.data = payload;
  }

  var ee = new EE();
  ee.run = function() {

    run(script, ee, opts);
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
      var pp = arrivals[options.mode].process(ar, function() {

        runScenario(script, intermediate, aggregate);
      });
      pp.start();
      setTimeout(function() {

        ee.emit('phaseCompleted', {
          index: i,
          name: phaseSpec.name,
          duration: phaseSpec.duration
        });
        var ppStoppedAt = process.hrtime(ppStartedAt);
        var ppRanFor = (ppStoppedAt[0] * 1e9) + ppStoppedAt[1];
        debug('PoissonProcess ran for %s', ppRanFor / 1e6);
        pp.stop();
        return callback(null);
      }, phaseSpec.duration * 1000);
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

        return ee.emit('done', Report);
      } else {
        debug('Pending requests: %s', pendingRequests.toJSON());
        debug('Pending scenarios: %s', pendingScenarios.toJSON());
      }
    }, 3 * 1000);
  });
}

/**
 * Run one of the scenarios defined in the script.
 */
function runScenario(script, intermediate, aggregate) {
  var scenarioSpec = pickScenario(script.scenarios);
  var flowSpec = scenarioSpec.flow;

  var initialContext = createContext(script);

  var engine = scenarioSpec.engine || 'http';
  var scenario = Workers[engine].create(
    flowSpec, script.config, initialContext);

  intermediate.newScenario();
  aggregate.newScenario();

  scenario.on('started', function() {
    pendingScenarios.inc();
  });
  scenario.on('error', function(errCode) {
    intermediate.addError(errCode);
    aggregate.addError(errCode);
  });
  scenario.on('request', function() {
    intermediate.newRequest();
    aggregate.newRequest();

    pendingRequests.inc();
  });
  scenario.on('response', function(delta, code) {
    intermediate.completedRequest();
    intermediate.addLatency(delta);
    intermediate.addCode(code);

    aggregate.completedRequest();
    aggregate.addLatency(delta);
    aggregate.addCode(code);

    pendingRequests.dec();
  });

  scenario.launch(function(err, context) {
    pendingScenarios.dec();
    if (err) {
      debug(err);
      //debug('Scenario aborted due to error');
      cancelledRequests.inc(context._plannedRequests);
    } else {
      //debug('Scenario completed');
      //debug(context);
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
    vars: {}
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
