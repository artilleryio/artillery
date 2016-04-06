/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const async = require('async');
const _ = require('lodash');
const request = require('request');
const jsonpath = require('JSONPath');
const debug = require('debug')('http');
const debugResponse = require('debug')('http:response');
const VERSION = require('../package.json').version;
const USER_AGENT = 'artillery ' + VERSION + ' (https://artillery.io)';
const engineUtil = require('./engine_util');
const template = engineUtil.template;
const http = require('http');
const https = require('https');
const fs = require('fs');

let xmlCapture = null;
try {
  xmlCapture = require('artillery-xml-capture');
} catch (e) {
}

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

  if (requestSpec.think) {
    return engineUtil.createThink(requestSpec);
  }

  var f = function(context, callback) {

    let method = _.keys(requestSpec)[0].toUpperCase();
    let params = requestSpec[method.toLowerCase()];
    let uri = maybePrependBase(template(params.url, context), config);
    let tls = config.tls || {};
    let timeout = config.timeout || 10;

    let requestParams = _.cloneDeep(params);
    requestParams = _.extend(requestParams, {
      uri: uri,
      method: method,
      headers: {
      },
      timeout: timeout * 1000,
      jar: context._jar
    });
    requestParams = _.extend(requestParams, tls);

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

    let defaultCookie = config.defaults ? config.defaults.cookie || {} : {};
    let cookie = _.foldl(
      params.cookie,
      function(acc, v, k) {
        acc[k] = v;
        return acc;
      },
      defaultCookie);

    if (cookie) {
      _.each(cookie, function(v, k) {
        context._jar.setCookie(k + '=' + template(v, context), uri);
      });
    }

    if (config.http2) {
      requestParams.http2 = true;
    } else {
      requestParams.agent = context._agent;
    }

    request(requestParams, function requestCallback(err, res, body) {
      debug('request: %s', JSON.stringify({
	uri: requestParams.uri,
	method: requestParams.method,
	headers: requestParams.headers,
	json: requestParams.json
      }, null, 2));

      if (err) {
        let errCode = err.code || err.message;
        ee.emit('error', errCode);
        debug(err);
        // this aborts the scenario
        return callback(err, context);
      }

      debugResponse(JSON.stringify(res.headers, null, 2));
      debugResponse(JSON.stringify(res.body, null, 2));

      if (params.afterResponse) {
        let processFunc = config.processor[params.afterResponse];
        processFunc(null, res, context, ee);
      }

      if (params.capture || params.match) {
        let parser;
        let extractor;
        if ((params.capture && params.capture.json) || (params.match && params.match.json)) {
          parser = parseJSON;
          extractor = extractJSONPath;
        } else if (xmlCapture && (params.capture && params.capture.xpath) || (params.match && params.match.xpath)) {
          parser = xmlCapture.parseXML;
          extractor = xmlCapture.extractXPath;
        } else if ((params.capture && params.capture.regexp) || (params.match && params.match.regexp)) {
          parser = dummyParser;
          extractor = extractRegExp;
        } else {
          if (isJSON(res)) {
            parser = parseJSON;
            extractor = extractJSONPath;
          } else if (xmlCapture && isXML(res)) {
            parser = xmlCapture.parseXML;
            extractor = xmlCapture.extractXPath;
          } else {
            // We really don't know what to do here.
            parser = dummyParser;
            extractor = dummyExtractor;
          }
        }

        parser(res.body, function(err2, doc) {
          if (err2) {
            return callback(err2, null);
          }

          if (params.match) {
            let expr = params.match.json || params.match.xpath;
            let result = extractor(doc, expr);
            let expected = template(params.match.value, context);
            debug('match: %s, expected: %s, got: %s', expr, expected, result);
            if (result !== expected) {
              ee.emit('match', false, {
                expected: expected,
                got: result,
                request: requestParams
              });
              if (params.match.strict) {
                // it's not an error but we finish the scenario
                return callback(null, context);
              }
            } else {
              ee.emit('match', true);
            }
          }

          if (params.capture) {
            let expr = params.capture.json || params.capture.xpath || params.capture.regexp;
            let result = extractor(doc, expr);
            context.vars[params.capture.as] = result;
            debug('capture: %s = %s', params.capture.as, result);

            if (params.capture.transform) {
              let result2 = engineUtil.evil(
                context.vars,
                params.capture.transform);
              context.vars[params.capture.as] = result2;
              debug('transform: %s = %s', params.capture.as, context.vars[params.capture.as]);
            }
          }

          debug('context.vars.$ = %j', doc);
          context.vars.$ = doc;
          context._successCount++;
          context._pendingRequests--;
          return callback(null, context);
        });
      } else {
        context.vars.$ = res.body;
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
        ee.emit('response', delta, code, context._uid);
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

function dummyParser(body, callback) {
  return callback(null, body);
}

// doc is a JSON object
function extractJSONPath(doc, expr) {
  let results = jsonpath.eval(doc, expr);
  if (results.length > 1) {
    return results[randomInt(0, results.length - 1)];
  } else {
    return results[0];
  }
}

// doc is a string or an object (body parsed by Request when headers indicate JSON)
function extractRegExp(doc, expr) {
  let str;
  if (typeof doc === 'string') {
    str = doc;
  } else {
    str = JSON.stringify(doc); // FIXME: not the same string as the one we got from the server
  }
  let rx = new RegExp(expr);
  let match = rx.exec(str);
  if (match[0]) {
    return match[0];
  } else {
    return '';
  }
}

function dummyExtractor() {
  return '';
}

function randomInt (low, high) {
  return Math.floor(Math.random() * (high - low + 1) + low);
}
