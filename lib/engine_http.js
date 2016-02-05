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
const xml = require('libxmljs');

module.exports = HttpEngine;

function HttpEngine(config) {
  this.config = config;
}

HttpEngine.prototype.step = function step(requestSpec, ee) {
  let self = this;
  let config = this.config;

  if (requestSpec.loop) {
    let steps = _.map(requestSpec.loop, function(rs) {
      return self.step(rs, ee);
    });

    return engineUtil.createLoopWithCount(requestSpec.count || -1, steps);
  }

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

      if (params.capture || params.match) {
        if (isJSON(res)) {
          parseJSON(res.body, function(err2, r) {
            if (err2) {
              let errCode = err.code || err.message;
              ee.emit('error', errCode);
              debug(err);
              // this aborts the scenario
              return callback(err, context);
            }

            if (params.match) {
              let result = jsonpath.eval(r, params.match.json)[0];
              let value = template(params.match.value, context);
              debug('match: %s, expected: %s, got: %s', params.match.json, value, result);

              if (result !== value) {
                ee.emit('match', false, {
                  expected: value,
                  got: result,
                  request: requestParams
                });
                if (params.match.strict) {
                  return callback(null, context);
                }
              } else {
                ee.emit('match', true);
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
                debug('transform: %s = %s',
                      params.capture.as, context.vars[params.capture.as]);
              }
            }

            context.vars.$ = r;
            context._successCount++;
            context._pendingRequests--;
            return callback(null, context);
          });
        } else if (isXML(res)) {
          parseXML(res.body, function(err2, doc) {
            if (err2) {
              let errCode = err.code || err.message;
              ee.emit('error', errCode);
              debug(err);
              // this aborts the scenario
              return callback(err, context);
            }

            if (params.match) {
              let result = doc.get(params.match.xpath).text();
              let value = template(params.match.value, context);
              debug('match: %s, expected: %s, got: %s', params.match.xpath, value, result);
              if (result !== value) {
                ee.emit('match', false, {
                  expected: value,
                  got: result,
                  request: requestParams
                });
                if (params.match.strict) {
                  return callback(null, context);
                }
              } else {
                ee.emit('match', true);
              }
            }
            if (params.capture) {
              let capturedVal = doc.get(params.capture.xpath).text();
              context.vars[params.capture.as] = capturedVal;
              debug('capture: %s = %s', params.capture.as, capturedVal);
              if (params.capture.transform) {
                let transformedVal = engineUtil.evil(
                  context.vars,
                  params.capture.transform);
                context.vars[params.capture.as] = transformedVal;
                debug('transform: %s = %s',
                      params.capture.as, context.vars[params.capture.as]);
              }
            }

            context.vars.$ = body; // inconsistency - string here, json object when json
            context._successCount++;
            context._pendingRequests--;
            return callback(null, context);
          });
        } else {
          // FIXME: We are trying to match on something that we cannot parse.
          context._successCount++;
          context._pendingRequests--;
          return callback(null, context);
        }
      } else {
        context._successCount++;
        context._pendingRequests--;
        return callback(null, context);
      }
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

/*
 * Given a response object determine if it's JSON
 */
function isJSON(res) {
  debug('isJSON: content-type = %s', res.headers['content-type']);
  return (res.headers['content-type'] &&
          /^application\/json/.test(res.headers['content-type']));
}

/*
 * Given a response object determine if it's some kind of XML
 */
function isXML(res) {
  return (res.headers['content-type'] &&
          (/^[a-zA-Z]+\/xml/.test(res.headers['content-type']) ||
           /^[a-zA-Z]+\/[a-zA-Z]+\+xml/.test(res.headers['content-type'])));

}

/*
 * Wrap JSON.parse in a callback
 */
function parseJSON(body, callback) {
  let r;
  try {
    if (typeof body === 'string') {
      r = JSON.parse(body);
    } else {
      r = body;
    }
    return callback(null, r);
  } catch(err) {
    return callback(err, null);
  }
}

/*
 * Wrap XML parser in a callback
 */
function parseXML(body, callback) {
  try {
    let doc = xml.parseXml(body);
    return callback(null, doc);
  } catch(err) {
    return callback(err, null);
  }
}
