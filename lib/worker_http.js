'use strict';

var EE = require('events').EventEmitter;
var async = require('async');
var _ = require('lodash');
var request = require('request');
var jsonpath = require('JSONPath');
var mustache = require('mustache');
var traverse = require('traverse');
var debug = require('debug')('http');
var VERSION = require('../package.json').version;
var USER_AGENT = 'minigun ' + VERSION + ' (https://artillery.io)';
var workerUtil = require('./worker_util.js');

module.exports = {
  create: createScenarioTask
};

/**
 * A worker:
 * - exports a create() function which takes a scenario spec, config, and an
 *   initial state
 * - returns an ee with a launch() method and which emits the following
 *   events for book keeping:
 *   1. 'started' - scenario is now running
 *   2. 'request' - a request is about to be made
 *   3. 'response' - a response has been received after delta ms with
 *      a response code n.
 *   4. 'error' - operational error (ETIMEDOUT, ECONNREFUSED etc)
 *
 */

function createScenarioTask(scenarioSpec, config, initialContext) {

  initialContext._successCount = 0;
  initialContext._pendingRequests = _.size(
    _.reject(scenarioSpec, function(rs) {
      return (typeof rs.think === 'number');
    }));

  var zeroth = function(callback) {
    callback(null, initialContext);
  };

  var ee = new EE();

  var tasks = _.foldl(scenarioSpec, function(acc, rs) {
    acc.push(createRequest(rs, config, ee));
    return acc;
  }, [zeroth]);

  var scenarioTask = function(callback) {
    async.waterfall(tasks, function(err, scenarioContext) {
      return callback(err, scenarioContext);
    });
  };

  ee.launch = function(callback) {
    ee.emit('started');
    scenarioTask(callback);
  };

  return ee;
}

function createRequest(requestSpec, config, ee) {
  if (requestSpec.think) {
    return workerUtil.createThink(requestSpec);
  }

  var f = function(context, callback) {
    var method = _.keys(requestSpec)[0].toUpperCase();
    var params = requestSpec[method.toLowerCase()];
    var uri = maybePrependBase(template(params.url, context), config);
    var requestParams = {
      uri: uri,
      method: method,
      headers: {
      },
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
    var defaultHeaders = lowcaseKeys(
      (config.defaults && config.defaults.headers) ?
        config.defaults.headers : {'user-agent': USER_AGENT});
    requestParams.headers = _.extend(defaultHeaders,
      lowcaseKeys(params.headers));

    request(requestParams, function requestCallback(err, res, body) {
      if (err) {
        var errCode = err.code;
        ee.emit('error', errCode);
        debug(err);
        // this aborts the scenario
        return callback(err, context);
      }

      if (res.headers['content-type'] &&
          res.headers['content-type'].match(/^application\/json/)) {
        try {
          var r;
          if (typeof res.body === 'string') {
            r = JSON.parse(res.body);
          } else {
            r = res.body;
          }

          if (params.match) {
            var result = jsonpath.eval(r, params.match.json)[0];
            var value = template(params.match.value, context);

            if (result !== value) {
              // abort the scenario
              // return callback(err, context);
            } else {
              ee.emit('match');
            }
          }

          if (requestSpec.capture) {
            var capturedVal = jsonpath.eval(r, params.capture.json)[0];
            context.vars[params.as] = capturedVal;
          }
          context.vars.$ = r;
        } catch (e) {
        }
      }

      context._successCount++;
      context._pendingRequests--;
      return callback(null, context);
    })
    .on('request', function(req) {
      ee.emit('request');

      var startedAt = process.hrtime();

      req.on('response', function updateLatency(res) {
        var code = res.statusCode;
        var endedAt = process.hrtime(startedAt);
        var delta = (endedAt[0] * 1e9) + endedAt[1];
        debug('delta: %s', delta);
        ee.emit('response', delta, code);
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

/*
 * Given a dictionary, return a dictionary with all keys lowercased.
 */
function lowcaseKeys(h) {
  return _.transform(h, function(result, v, k) {
    result[k.toLowerCase()] = v;
  });
}
