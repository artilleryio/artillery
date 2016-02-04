'use strict';

const async = require('async');
const _ = require('lodash');
const request = require('request');
const jsonpath = require('JSONPath');
const debug = require('debug')('http');
const VERSION = require('../package.json').version;
const USER_AGENT = 'artillery ' + VERSION + ' (https://artillery.io)';
const engineUtil = require('./engine_util');
const template = engineUtil.template;
const http = require('http');
const https = require('https');
const fs = require('fs');

module.exports = HttpEngine;

function HttpEngine(config) {
  this.config = config;
}

HttpEngine.prototype.step = function step(requestSpec, ee) {
  let config = this.config;

  var f = function(context, callback) {
    let method = _.keys(requestSpec)[0].toUpperCase();
    let params = requestSpec[method.toLowerCase()];
    let uri = maybePrependBase(template(params.url, context), config);
    let tls = config.tls || {};
    let timeout = config.timeout || 10;

    var requestParams = _.extend(tls, {
      uri: uri,
      method: method,
      headers: {
      },
      timeout: timeout * 1000,
      jar: context._jar
    });

    if (params.json) {
      requestParams.json = template(params.json, context);
    } else if (params.body) {
      requestParams.body = template(params.body, context);
    }

    // Assign default headers then overwrite as needed
    let defaultHeaders = lowcaseKeys(
      (config.defaults && config.defaults.headers) ?
        config.defaults.headers : {'user-agent': USER_AGENT});
    requestParams.headers = _.extend(defaultHeaders,
                                     lowcaseKeys(params.headers));
    let headers = _.foldl(requestParams.headers,
                          function(acc, v, k) {
                            acc[k] = template(v, context);
                            return acc;
                          }, {});

    requestParams.headers = headers;
    if (params.cookie) {
      _.each(params.cookie, function(v, k) {
        context._jar.setCookie(k + '=' + template(v, context), uri);
      });
    }

    if (config.http2) {
      requestParams.http2 = true;
    } else {
      requestParams.agent = context._agent;
    }

    debug('request: %j', requestParams);

    request(requestParams, function requestCallback(err, res, body) {
      if (err) {
        let errCode = err.code || err.message;
        ee.emit('error', errCode);
        debug(err);
        // this aborts the scenario
        return callback(err, context);
      }

      if (res.headers['content-type'] &&
          res.headers['content-type'].match(/^application\/json/)) {
        try {
          let r;
          if (typeof res.body === 'string') {
            r = JSON.parse(res.body);
          } else {
            r = res.body;
          }

          if (params.match) {
            let result = jsonpath.eval(r, params.match.json)[0];
            let value = template(params.match.value, context);

            if (result !== value) {
              // abort the scenario
              // return callback(err, context);
            } else {
              debug('match: %s matched %s in response', params.match.json, value);
              ee.emit('match');
            }
          }

          if (params.capture) {
            let capturedVal = jsonpath.eval(r, params.capture.json)[0];
            context.vars[params.capture.as] = capturedVal;

            debug('capture: %s = %s', params.capture.as, capturedVal);

            if (params.capture.transform) {
              let transformedVal = engineUtil.evil(
                context.vars,
                params.capture.transform);
              context.vars[params.capture.as] = transformedVal;
              debug('transform: %s = %s', params.capture.as, context.vars[params.capture.as]);
            }
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

      const startedAt = process.hrtime();

      req.on('response', function updateLatency(res) {
        let code = res.statusCode;
        const endedAt = process.hrtime(startedAt);
        let delta = (endedAt[0] * 1e9) + endedAt[1];
        ee.emit('response', delta, code);
      });
    }).on('end', function() {
    });
  };

  return f;
};

HttpEngine.prototype.compile = function compile(tasks, scenarioSpec, ee) {
  let config = this.config;
  let tls = config.tls || {};

  return function scenario(initialContext, callback) {
    //
    // Calculate the number of steps we expect to take.
    //
    initialContext._successCount = 0;
    initialContext._pendingRequests = _.size(
      _.reject(scenarioSpec, function(rs) {
        return (typeof rs.think === 'number');
      }));

    initialContext._jar = request.jar();

    if (!config.http2) {
      let agentOpts = {
        keepAlive: true,
        keepAliveMsecs: 1000,
        maxSockets: 1,
        maxFreeSockets: 1
      };

      if ((/^https/i).test(config.target)) {
        if (tls.pfx) {
          agentOpts.pfx = fs.readFileSync(tls.pfx);
        }
        initialContext._agent = new https.Agent(agentOpts);
      } else {
        initialContext._agent = new http.Agent(agentOpts);
      }
    }

    let steps = _.flatten([
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
};

function maybePrependBase(uri, config) {

  if (_.startsWith(uri, '/')) {
    return config.target + uri;
  } else {
    return uri;
  }
}

/*
 * Given a dictionary, return a dictionary with all keys lowercased.
 */
function lowcaseKeys(h) {
  return _.transform(h, function(result, v, k) {
    result[k.toLowerCase()] = v;
  });
}
