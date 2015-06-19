'use strict';

var EE = require('events').EventEmitter;
var _ = require('lodash');
var async = require('async');
var debug = require('debug')('runner');
var arrivals = require('./arrivals');
var Measured = require('measured');

var Workers = {
  http: require('./worker_http'),
  ws: require('./worker_ws')
};

module.exports = runner;

var Stats;
var PeriodicStats;
var pendingRequests = new Measured.Counter();
var pendingScenarios = new Measured.Counter();

var Report = {
  intermediate: [],
  aggregate: {}
};

function runner(script, payload, options) {

  var opts = _.assign({
    periodicStats: 10
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

  Stats = {
    generatedScenarios: new Measured.Counter(), // generated_users_total
    completedScenarios: new Measured.Counter(), // finished_users_total - succesful only
    completedRequests: new Measured.Counter(), // request_count - successful requests only
    rps: new Measured.Meter({
      rateUnit: 1 * 1000,
      tickInterval: 1 * 1000
    }),
    latency: new Measured.Histogram(),
    errors: {
    },
    codes: { // code_NNN_total
    }
  };

  PeriodicStats = {
    generatedScenarios: new Measured.Counter(), // generated_users_last10
    completedScenarios: new Measured.Counter(), // finished_users_last10
    completedRequests: new Measured.Counter(), // request_10sec_count
    rps: new Measured.Meter({
      rateUnit: 1 * 1000,
      tickInterval: 1 * 1000
    }),
    latency: new Measured.Histogram(),
    errors: {
    },
    codes: { // code_NNN_last10
    }
  };

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
      var pp = arrivals.poisson.process(ar, function() {

        runScenario(script);
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
    var latency = PeriodicStats.latency.toJSON();
    var rps = PeriodicStats.rps.toJSON();
    var stats = {
      timestamp: new Date().toISOString(),
      newScenarios: PeriodicStats.generatedScenarios.toJSON(),
      completedScenarios: PeriodicStats.completedScenarios.toJSON(),
      completedRequests: PeriodicStats.completedRequests.toJSON(),
      rps: {
        mean: Math.round(rps.mean * 100) / 100,
        count: rps.count
      },
      latency: {
        min: latency.min ? Math.round(latency.min * 100) / 100 : null,
        max: latency.max ? Math.round(latency.max * 100) / 100 : null,
        median: latency.median ? Math.round(latency.median * 100) / 100 : null,
        p95: latency.p95 ? Math.round(latency.p95 * 100) / 100 : null,
        p99: latency.p99 ? Math.round(latency.p99 * 100) / 100 : null
      },
      errors: PeriodicStats.errors,
      codes: PeriodicStats.codes
    };
    Report.intermediate.push(stats);
    PeriodicStats.generatedScenarios.reset();
    PeriodicStats.completedScenarios.reset();
    PeriodicStats.completedRequests.reset();
    PeriodicStats.rps.reset();
    PeriodicStats.rps.unref();
    clearInterval(PeriodicStats.rps._interval);
    PeriodicStats.rps = new Measured.Meter({
      rateUnit: 1 * 1000,
      tickInterval: 1 * 1000
    });
    PeriodicStats.latency.reset();
    PeriodicStats.errors = {};
    PeriodicStats.codes = {};

    ee.emit('stats', stats);
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

        var latency = Stats.latency.toJSON();
        var rps = Stats.rps.toJSON();
        Report.aggregate = {
          generatedScenarios: Stats.generatedScenarios.toJSON(),
          completedScenarios: Stats.completedScenarios.toJSON(),
          completedRequests: Stats.completedRequests.toJSON(),
          rps: {
            mean: Math.round(rps.mean * 100) / 100,
            count: rps.count
          },
          latency: {
            min: latency.min ? Math.round(latency.min * 100) / 100 : null,
            max: latency.max ? Math.round(latency.max * 100) / 100 : null,
            median: latency.median ?
              Math.round(latency.median * 100) / 100 : null,
            p95: latency.p95 ? Math.round(latency.p95 * 100) / 100 : null,
            p99: latency.p99 ? Math.round(latency.p99 * 100) / 100 : null
          },
          errors: Stats.errors,
          codes: Stats.codes
        };

        clearInterval(doneYet);
        clearInterval(periodicStatsTimer);
        Stats.rps.unref();
        PeriodicStats.rps.unref();

        return ee.emit('done', Report);
      } else {
        debug('Pending requests: %s', pendingRequests.toJSON());
        debug('Pending scenarios: %s', pendingScenarios.toJSON());
      }
    }, 3 * 1000);
  });
}

/**
 * Returns a scenario picked at random from a list of scenarios.
 */
function pickScenario(scenarios) {
  return scenarios[_.random(0, scenarios.length - 1)];
}

/**
 * Run one of the scenarios defined in the script.
 *
 */
function runScenario(script) {
  var scenarioSpec = pickScenario(script.scenarios);
  var flowSpec = scenarioSpec.flow;

  var INITIAL_CONTEXT = {
    vars: {
    }
  };
  var initialContext = _.cloneDeep(INITIAL_CONTEXT);
  if (script.config.payload && script.config.payload.data) {
    var i = _.random(0, script.config.payload.data.length - 1);
    var row = script.config.payload.data[i];
    _.each(script.config.payload.fields, function(fieldName, j) {

      initialContext.vars[fieldName] = row[j];
    });
  }

  var engine = scenarioSpec.engine || 'http';
  debug('engine = ' + engine);
  var scenario = Workers[engine].create(
    flowSpec, script.config, initialContext);

  Stats.generatedScenarios.inc();
  PeriodicStats.generatedScenarios.inc();

  scenario.on('started', function() {
    pendingScenarios.inc();
  });
  scenario.on('completed', function() {
    pendingScenarios.dec();
  });
  scenario.on('error', function(errCode) {
    if (Stats.errors[errCode]) {
      Stats.errors[errCode].inc();
    } else {
      Stats.errors[errCode] = new Measured.Counter();
    }
    if (PeriodicStats.errors[errCode]) {
      PeriodicStats.errors[errCode].inc();
    } else {
      PeriodicStats.errors[errCode] = new Measured.Counter();
    }
  });
  // NB: thinks are NOT counted as requests
  scenario.on('request', function() {
    pendingRequests.inc();
    Stats.rps.mark();
    PeriodicStats.rps.mark();
  });
  scenario.on('response', function(delta, code) {
    pendingRequests.dec();
    Stats.completedRequests.inc();
    PeriodicStats.completedRequests.inc();

    Stats.latency.update(delta / 1e6);
    PeriodicStats.latency.update(delta / 1e6);

    if (Stats.codes[code]) {
      Stats.codes[code].inc();
    } else {
      Stats.codes[code] = new Measured.Counter();
    }
    if (PeriodicStats.codes[code]) {
      PeriodicStats.codes[code].inc();
    } else {
      PeriodicStats.codes[code] = new Measured.Counter();
    }
  });

  scenario.launch(function(err, context) {

    if (err) {
      debug(err);
      //debug('Scenario aborted due to error');
    } else {
      //debug('Scenario completed');
      //debug(context);
      Stats.completedScenarios.inc();
      PeriodicStats.completedScenarios.inc();
    }
  });
}
