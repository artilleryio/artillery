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
  compile: compileScenario
};

function compileScenario(scenarioSpec, config, ee) {
  var tasks = _.map(scenarioSpec, function(rs) {
    return createRequest(rs, config, ee);
  });

  return function scenario(initialContext, callback) {
    //
    // Calculate the number of steps we expect to take.
    //
    initialContext._successCount = 0;
    initialContext._pendingRequests = _.size(
      _.reject(scenarioSpec, function(rs) {
        return (typeof rs.think === 'number');
      }));

    var steps = _.flatten([
      function zero(cb) {
        ee.emit('started');
        return cb(null, initialContext);
      },
      tasks
    ]);

    async.waterfall(
      steps,
      function scenarioWaterfallCb(err, context) {
        return callback(err, context);
      });
  };
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
    } else if (params.body) {
      requestParams.body = template(params.body, context);
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
