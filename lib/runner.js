'use strict';

var EE = require('events').EventEmitter;
var _ = require('lodash');
var async = require('async');
var debug = require('debug')('runner');
var arrivals = require('./arrivals');
var request = require('request');
var Measured = require('measured');
var mustache = require('mustache');
var traverse = require('traverse');

module.exports = runner;

var Stats;
var PeriodicStats;
var INITIAL_CONTEXT = {
  vars: {
  }
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
};


function run(script, ee, options) {

  Stats = {
    pendingRequests: new Measured.Counter(),
    pendingScenarios: new Measured.Counter(),

    generatedScenarios: new Measured.Counter(), // generated_users_total
    completedScenarios: new Measured.Counter(), // finished_users_total - succesful only
    completedRequests: new Measured.Counter(), // request_count - successful requests only
    rps: new Measured.Meter({
      rateUnit: 1 * 1000,
      tickInterval: 1 * 1000
    }),
    latency: new Measured.Histogram(),
    errors: new Measured.Counter(),
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
    errors: new Measured.Counter(),
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
      debug('ar = %s', ar);
      var ppStartedAt = process.hrtime();
      var pp = arrivals.poisson.process(ar, function() {

        launchScenario(script);
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
    ee.emit('stats', PeriodicStats);
    PeriodicStats.generatedScenarios.reset();
    PeriodicStats.completedScenarios.reset();
    PeriodicStats.completedRequests.reset();
    PeriodicStats.rps = new Measured.Meter({
      rateUnit: 1 * 1000,
      tickInterval: 1 * 1000
    });
    PeriodicStats.latency.reset();
    PeriodicStats.errors.reset();
    PeriodicStats.codes = {};
  }, options.periodicStats * 1000);

  async.series(phases, function(err) {

    if (err) {
      debug(err);
    }

    debug('All phases launched');

    var doneYet = setInterval(function() {
      if (Stats.pendingScenarios.toJSON() === 0) {
        if (Stats.pendingRequests.toJSON() !== 0) {
          debug('DONE. Pending requests: %s', Stats.pendingRequests.toJSON());
        }
        clearInterval(doneYet);
        clearInterval(periodicStatsTimer);
        Stats.rps.unref();
        return ee.emit('done', Stats);
      } else {
        debug('Pending requests: %s', Stats.pendingRequests.toJSON());
        debug('Pending scenarios: %s', Stats.pendingScenarios.toJSON());
      }
    }, 3 * 1000);
  });
}

function launchScenario(script) {

  var i = _.random(0, script.scenarios.length - 1);
  var spec = script.scenarios[i].flow;
  var scenario = createScenarioTask(spec, script.config);
  Stats.generatedScenarios.inc();
  PeriodicStats.generatedScenarios.inc();
  scenario(function(err, context) {

    if (err) {
      debug(err);
      debug('Scenario aborted due to error');
    } else {
      //debug('Scenario completed');
      //debug(context);
      Stats.completedScenarios.inc();
      PeriodicStats.completedScenarios.inc();
    }
  });

}

//
// This needs to be fixed up.
//
function maybePrependBase(uri, config) {

  if (_.startsWith(uri, '/')) {
    return config.target + uri;
  } else {
    return uri;
  }
}

function createRequestTask(requestSpec, config) {

  Stats.pendingRequests.inc();

  if (typeof requestSpec.think === 'number') {
    return function(context, callback) {

      debug('thinking for ' + requestSpec.think + ' seconds');
      setTimeout(function() {

        callback(null, context);
      }, requestSpec.think * 1000);
    };
  }

  var f = function(context, callback) {

    var method = _.keys(requestSpec)[0].toUpperCase();
    var params = requestSpec[method.toLowerCase()];
    var uri = maybePrependBase(template(params.url, context), config);
    var requestParams = {
      uri: uri,
      method: method,
      headers: {},
      timeout: 10 * 1000
    };

    if (params.json) {
      requestParams.json = template(params.json, context);
      //debug('json', requestParams.json);
    } else if (params.body) {
      requestParams.body = template(params.body, context);
      //debug('body', requestParams.body);
    }

    // Assign default headers then overwrite as needed
    if (config.defaults && config.defaults.headers) {
      requestParams.headers = _.extend(
        _.cloneDeep(config.defaults.headers || {}),
        params.headers || {});
    }

    request(requestParams, function requestCallback(err, res, body) {
      Stats.pendingRequests.dec();

      if (err) {
        Stats.errors.inc();
        PeriodicStats.errors.inc();
        debug(err);
        // this aborts the scenario
        return callback(err, context);
      } else {
        Stats.completedRequests.inc();
        PeriodicStats.completedRequests.inc();

        var code = res.statusCode;
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

        return callback(null, context);
      }
    })
    .on('request', function(req) {
      Stats.rps.mark();
      PeriodicStats.rps.mark();

      var startedAt = process.hrtime();

      req.on('response', function updateLatency(_resp) {
        var endedAt = process.hrtime(startedAt);
        var delta = (endedAt[0] * 1e9) + endedAt[1];
        Stats.latency.update(delta / 1e6);
        PeriodicStats.latency.update(delta / 1e6);
      });
    }).on('end', function() {
    });
  };

  return f;
}

function createScenarioTask(scenarioSpec, config) {

  var zeroth = function(callback) {

    var initialContext = _.cloneDeep(INITIAL_CONTEXT);
    if (config.payload && config.payload.data) {
      var i = _.random(0, config.payload.data.length - 1);
      var row = config.payload.data[i];
      _.each(config.payload.fields, function(fieldName, j) {

        initialContext.vars[fieldName] = row[j];
      });
    }
    callback(null, initialContext);
  };

  var tasks = _.foldl(scenarioSpec, function(acc, rs) {

    acc.push(createRequestTask(rs, config));
    return acc;
  }, [zeroth]);

  var scenarioTask = function(callback) {

    async.waterfall(tasks, function(err, scenarioContext) {

      Stats.pendingScenarios.dec();
      if (err) {
        debug(err);
      }
      return callback(null, scenarioContext);
    });
  };

  Stats.pendingScenarios.inc();
  return scenarioTask;
}

function template(o, context) {

  var result;
  if (typeof o === 'object') {
    result = traverse(o).map(function(x) {

      if (typeof x === 'string') {
        this.update(template(x, context));
      } else {
        return x;
      }
    });
  } else {
    result = mustache.render(o, context.vars);
  }
  return result;
}
