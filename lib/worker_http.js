'use strict';

var EE = require('events').EventEmitter;
var async = require('async');
var _ = require('lodash');
var request = require('request');
var mustache = require('mustache');
var traverse = require('traverse');
var debug = require('debug')('run_http');

module.exports = {
  create: createScenarioTask
};

/**
 * A worker:
 * - exports a create() function which takes a scenario spec, config, and an
 *   initial state
 * - returns an ee with a launch() method and which emits the following
 *   events for book keeping:
 *   1. 'request' - a request is about to be made
 *   2. 'response' - a response has been received after delta ms with
 *      a response code n.
 *   3. 'errorCode' - operational error (ETIMEDOUT, ECONNREFUSED etc)
 */

function createScenarioTask(scenarioSpec, config, initialContext) {

  var zeroth = function(callback) {
    callback(null, initialContext);
  };

  var ee = new EE();

  var tasks = _.foldl(scenarioSpec, function(acc, rs) {

    // createRequest task can come from http_vuser
    acc.push(createRequest(rs, config, ee));
    return acc;
  }, [zeroth]);

  var scenarioTask = function(callback) {
    async.waterfall(tasks, function(err, scenarioContext) {

      ee.emit('scenarioCompleted');
      if (err) {
        debug(err);
      }
      return callback(null, scenarioContext);
    });
  };

  ee.launch = function(callback) {
    ee.emit('scenarioStarted');
    scenarioTask(callback);
  };

  return ee;
}

function createRequest(requestSpec, config, ee) {
  if (typeof requestSpec.think === 'number') {
    return function(context, callback) {
      ee.emit('pending');
      debug('thinking for ' + requestSpec.think + ' seconds');
      setTimeout(function() {
        ee.emit('completed');
        callback(null, context);
      }, requestSpec.think * 1000);
    };
  }

  var f = function(context, callback) {
    ee.emit('pending');
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
      ee.emit('completed');
      if (err) {
        var errCode = err.code;
        ee.emit('errorCode', errCode);
        debug(err);
        // this aborts the scenario
        return callback(err, context);
      }
      return callback(null, context);
    })
    .on('request', function(req) {
      ee.emit('request');

      var startedAt = process.hrtime();

      req.on('response', function updateLatency(res) {
        var code = res.statusCode;
        var endedAt = process.hrtime(startedAt);
        var delta = (endedAt[0] * 1e9) + endedAt[1];
        ee.emit('response', delta / 1e6, code);
      });
    }).on('end', function() {
    });
  };

  return f;
}

function maybePrependBase(uri, config) {

  if (_.startsWith(uri, '/')) {
    return config.target + uri;
  } else {
    return uri;
  }
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
