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
const debugCapture = require('debug')('http:capture');
const VERSION = require('../package.json').version;
const USER_AGENT = 'artillery ' + VERSION + ' (https://artillery.io)';
const engineUtil = require('./engine_util');
const template = engineUtil.template;
const http = require('http');
const https = require('https');
const fs = require('fs');
const filtrex = require('filtrex');
const cheerio = require('cheerio');

let xmlCapture;
try {
  xmlCapture = require('artillery-xml-capture');
} catch (e) {
  xmlCapture = null;
}

module.exports = HttpEngine;

function HttpEngine(script) {
  this.config = script.config;

  if (script.config.http && script.config.http.pool) {
    this.pool = {
      maxSockets: Number(script.config.http.pool)
    };
  }
}

HttpEngine.prototype.createScenario = function(scenarioSpec, ee) {
  var self = this;
  let tasks = _.map(scenarioSpec.flow, function(rs) {
    if (rs.think) {
      return engineUtil.createThink(rs);
    }

    return self.step(rs, ee, {
      beforeRequest: scenarioSpec.beforeRequest || [],
      afterResponse: scenarioSpec.afterResponse || []
    });
  });

  return self.compile(tasks, scenarioSpec.flow, ee);
};

HttpEngine.prototype.step = function step(requestSpec, ee, opts) {
  opts = opts || {};
  let self = this;
  let config = this.config;

  if (requestSpec.loop) {
    let steps = _.map(requestSpec.loop, function(rs) {
      return self.step(rs, ee, opts);
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

    if (!engineUtil.isProbableEnough(params)) {
      return process.nextTick(function() {
        callback(null, context);
      });
    }

    if (typeof params.ifTrue !== undefined) {
      let cond;
      let result;
      try {
        cond = filtrex(params.ifTrue);
        result = cond(context.vars);
      } catch (e) {
        result = 1; // if the expression is incorrect, just proceed // TODO: debug message
      }
      if (typeof result === 'undefined' || result === 0) {
        return process.nextTick(function () {
          callback(null, context);
        });
      }
    }

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
    let headers = _.reduce(requestParams.headers,
                          function(acc, v, k) {
                            acc[k] = template(v, context);
                            return acc;
                          }, {});
    requestParams.headers = headers;

    let defaultCookie = config.defaults ? config.defaults.cookie || {} : {};
    let cookie = _.reduce(
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
      if (!self.pool) {
        requestParams.agent = context._agent;
      } else {

        requestParams.pool = self.pool;
      }
    }

    // Run beforeRequest processors (scenario-level ones too)
    let functionNames = _.concat(opts.beforeRequest || [], params.beforeRequest || []);

    async.eachSeries(
      functionNames,
      function iteratee(functionName, next) {

        let processFunc = config.processor[functionName];
        processFunc(requestParams, context, ee, function(err) {
          if (err) {
            debug(err);
          }
          // TODO: A warning of some kind - we don't abort the scenario though
          return next(null);
        });
      },
      function done(err) {
        if (err) {
          debug(err);
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
          debugResponse(JSON.stringify(body, null, 2));

          // Run afterResponse processors (scenario-level ones too)
          let functionNames = _.concat(opts.afterResponse || [], params.afterResponse || []);
          async.eachSeries(
            functionNames,
            function iteratee(functionName, next) {
              let processFunc = config.processor[functionName];
              processFunc(requestParams, res, context, ee, function(err) {
                // TODO: warn as above
                return next(null);
              });
            },
            function done(err) {
              // TODO: 150 lines of madness - refactor

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
                } else if ((params.capture && params.capture.header) || (params.match && params.match.header)) {
                  parser = dummyParser;
                  extractor = extractHeader;
                } else if ((params.capture && params.capture.selector) || (params.match && params.match.selector)) {
                  parser = dummyParser;
                  extractor = extractCheerio;
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

                // are we looking at body or headers:
                var content = res.body;
                if ((params.capture && params.capture.header) ||
                    (params.match && params.match.header)) {
                  content = res.headers;
                }

                parser(content, function(err2, doc) {
                  if (err2) {
                    return callback(err2, context);
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
                    let result;
                    let expr = (params.capture.json ||
                                params.capture.xpath ||
                                params.capture.regexp ||
                                params.capture.header ||
                                params.capture.selector);

                    if (params.capture.regexp && params.capture.group) {
                      result = extractor(doc, expr, params.capture.group);
                    } else if (params.capture.selector) {
                      result = extractor(doc, expr, params.capture);
                    } else {
                      result = extractor(doc, expr);
                    }
                    context.vars[params.capture.as] = result;
                    debugCapture('capture: %s = %s', params.capture.as, result);

                    if (params.capture.transform) {
                      let result2 = engineUtil.evil(
                        context.vars,
                        params.capture.transform);
                      context.vars[params.capture.as] = result2;
                      debugCapture('transform: %s = %s', params.capture.as, context.vars[params.capture.as]);
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
            });
        }).on('request', function(req) {
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

      }); // eachSeries
  };

  return f;
};

HttpEngine.prototype.compile = function compile(tasks, scenarioSpec, ee) {
  let self = this;
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
      if (!self.pool) {
        let agentOpts = {
          keepAlive: true,
          keepAliveMsecs: 1000,
          maxSockets: 1,
          maxFreeSockets: 1
        };

        // FIXME: This won't work if we have a pool - needs to be set in agentOptions
        // in request params
        if ((/^https/i).test(config.target)) {
          if (tls.pfx) {
            // FIXME: Path needs to be resolved relative to Artillery's cwd
            agentOpts.pfx = fs.readFileSync(tls.pfx);
          }
          initialContext._agent = new https.Agent(agentOpts);
        } else {
          initialContext._agent = new http.Agent(agentOpts);
        }
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
        // If the connection was refused we might not have a context
        if (context && context._agent) {
          context._agent.destroy();
        }
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
function extractRegExp(doc, expr, group) {
  let str;
  if (typeof doc === 'string') {
    str = doc;
  } else {
    str = JSON.stringify(doc); // FIXME: not the same string as the one we got from the server
  }
  let rx = new RegExp(expr);
  let match = rx.exec(str);
  if(group && match[group]) {
    return match[group];
  } else if (match[0]) {
    return match[0];
  } else {
    return '';
  }
}

function extractCheerio(doc, expr, opts) {
  let $ = cheerio.load(doc);
  let els = $(expr);
  let i = 0;
  if (typeof opts.index !== 'undefined') {
    if (opts.index === 'random') {
      i = Math.ceil(Math.random() * els.get().length - 1);
    } else if (opts.index === 'last') {
      i = els.get().length() - 1;
    } else if (typeof Number(opts.index) === 'number') {
      i = Number(opts.index);
    }
  }
  return els.slice(i, i + 1).attr(opts.attr);
}

function extractHeader(headers, headerName) {
  return headers[headerName];
}

function dummyExtractor() {
  return '';
}

function randomInt (low, high) {
  return Math.floor(Math.random() * (high - low + 1) + low);
}
