/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const async = require('async');
const _ = require('lodash');
const request = require('got');
const tough = require('tough-cookie');
const debug = require('debug')('http');
const debugRequests = require('debug')('http:request');
const debugResponse = require('debug')('http:response');
const debugFullBody = require('debug')('http:full_body');
const USER_AGENT = 'Artillery (https://artillery.io)';
const engineUtil = require('./engine_util');
const ensurePropertyIsAList = engineUtil.ensurePropertyIsAList;
const template = engineUtil.template;
const http = require('http');
const https = require('https');
const fs = require('fs');
const qs = require('querystring');
const filtrex = require('filtrex');
const urlparse = require('url').parse;
const FormData = require('form-data');
const HttpAgent = require('agentkeepalive');
const { HttpsAgent } = HttpAgent;
const { HttpProxyAgent, HttpsProxyAgent } = require('hpagent');
const decompressResponse = require('decompress-response');

module.exports = HttpEngine;

const DEFAULT_AGENT_OPTIONS = {
  keepAlive: true,
  keepAliveMsec: 1000
};

function createAgents(proxies, opts) {
  const agentOpts = Object.assign({}, DEFAULT_AGENT_OPTIONS, opts);

  const result = {
    httpAgent: null,
    httpsAgent: null
  };

  // HTTP proxy endpoint will be used for all requests, unless a separate
  // HTTPS proxy URL is also set, which will be used for HTTPS requests:
  if (proxies.http) {
    agentOpts.proxy = proxies.http;
    result.httpAgent = new HttpProxyAgent(agentOpts);

    if (proxies.https) {
      agentOpts.proxy = proxies.https;
    }

    result.httpsAgent = new HttpsProxyAgent(agentOpts);
    return result;
  }

  // If only HTTPS proxy is provided, it will be used for HTTPS requests,
  // but not for HTTP requests:
  if (proxies.https) {
    result.httpAgent = new HttpAgent(agentOpts);
    result.httpsAgent = new HttpsProxyAgent(Object.assign(
      { proxy: proxies.https },
      agentOpts));

    return result;
  }

  // By default nothing is proxied:
  result.httpAgent = new HttpAgent(agentOpts);
  result.httpsAgent = new HttpsAgent(agentOpts);
  return result;
}

function HttpEngine(script) {
  this.config = script.config;

  if (typeof this.config.defaults === 'undefined') {
    this.config.defaults = {};
  }

  // If config.http.pool is set, create & reuse agents for all requests (with
  // max sockets set). That's what we're done here.
  // If config.http.pool is not set, we create new agents for each virtual user.
  // That's done when the VU is initialized.

  this.maxSockets = Infinity;
  if (script.config.http && script.config.http.pool) {
    this.maxSockets = Number(script.config.http.pool);
  }
  let agentOpts = Object.assign(DEFAULT_AGENT_OPTIONS, {
    maxSockets: this.maxSockets,
    maxFreeSockets: this.maxSockets
  });

  const agents = createAgents({
    http: process.env.HTTP_PROXY,
    https: process.env.HTTPS_PROXY
  }, agentOpts);

  this._httpAgent = agents.httpAgent;
  this._httpsAgent = agents.httpsAgent;
}

HttpEngine.prototype.createScenario = function(scenarioSpec, ee) {
  var self = this;

  ensurePropertyIsAList(scenarioSpec, 'beforeRequest');
  ensurePropertyIsAList(scenarioSpec, 'afterResponse');
  ensurePropertyIsAList(scenarioSpec, 'beforeScenario');
  ensurePropertyIsAList(scenarioSpec, 'afterScenario');
  ensurePropertyIsAList(scenarioSpec, 'onError');

  // Add scenario-level hooks if needed:
  // For now, just turn them into function steps and insert them
  // directly into the flow array.
  // TODO: Scenario-level hooks will probably want access to the
  // entire scenario spec rather than just the userContext.
  const beforeScenarioFns = _.map(
    scenarioSpec.beforeScenario,
    function(hookFunctionName) {
      return {'function': hookFunctionName};
    });
  const afterScenarioFns = _.map(
    scenarioSpec.afterScenario,
    function(hookFunctionName) {
      return {'function': hookFunctionName};
    });

  const newFlow = beforeScenarioFns.concat(
    scenarioSpec.flow.concat(afterScenarioFns));

  scenarioSpec.flow = newFlow;

  let tasks = _.map(scenarioSpec.flow, function(rs) {
    return self.step(rs, ee, {
      beforeRequest: scenarioSpec.beforeRequest,
      afterResponse: scenarioSpec.afterResponse,
      onError: scenarioSpec.onError
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

    return engineUtil.createLoopWithCount(
      requestSpec.count || -1,
      steps,
      {
        loopValue: requestSpec.loopValue || '$loopCount',
        loopElement: requestSpec.loopElement || '$loopElement',
        overValues: requestSpec.over,
        whileTrue: self.config.processor ?
          self.config.processor[requestSpec.whileTrue] : undefined
      });
  }

  if (requestSpec.parallel) {
    let steps = _.map(requestSpec.parallel, function(rs) {
        return self.step(rs, ee, opts);
    });

    return engineUtil.createParallel(
        steps,
        {
          limitValue: requestSpec.limit
        }
      );
  }

  if (requestSpec.think) {
    return engineUtil.createThink(requestSpec, self.config.defaults.think);
  }

  if (requestSpec.log) {
    return function(context, callback) {
      console.log(template(requestSpec.log, context));
      return process.nextTick(function() { callback(null, context); });
    };
  }

  if (requestSpec.function) {
    return function(context, callback) {
      let processFunc = self.config.processor[requestSpec.function];
      if (processFunc) {
        return processFunc(context, ee, function(hookErr) {
          if (hookErr) {
            ee.emit('error', hookErr.code || hookErr.message);
          }
          return callback(hookErr, context);
        });
      } else {
        debug(`Function "${requestSpec.function}" not defined`);
        debug('processor: %o', self.config.processor);
        ee.emit('error', `Undefined function "${requestSpec.function}"`);
        return process.nextTick(function () { callback(null, context); });
      }
    };
  }

  let f = function(context, callback) {
    let method = _.keys(requestSpec)[0].toUpperCase();
    let params = requestSpec[method.toLowerCase()];

    const onErrorHandlers = opts.onError; // only scenario-lever onError handlers are supported

    // A special case for when "url" attribute is missing. We need to check for
    // it manually as request.js won't emit an 'error' event when the argument
    // is missing.
    // This will be obsoleted by better script validation.
    if (!params.url && !params.uri) {
      let err = new Error('an URL must be specified');
      ee.emit('error', err.message);
      return callback(err, context);
    }

    let tls = config.tls || {};
    let timeout = (config.timeout || _.get(config, 'http.timeout') || 10);

    if (!engineUtil.isProbableEnough(params)) {
      return process.nextTick(function() {
        callback(null, context);
      });
    }

    if (!_.isUndefined(params.ifTrue)) {
      let cond;
      let result;
      try {
        cond = _.has(config.processor, params.ifTrue) ?  config.processor[params.ifTrue]  : filtrex(params.ifTrue);
        result = cond(context.vars);
      } catch (e) {
        result = 1; // if the expression is incorrect, just proceed // TODO: debug message
      }
      if (!result) {
        return process.nextTick(function () {
          callback(null, context);
        });
      }
    }

    // Run beforeRequest processors (scenario-level ones too)
    let requestParams = _.cloneDeep(params);
    requestParams = _.extend(requestParams, {
      url: maybePrependBase(params.url || params.uri, config), // *NOT* templating here
      method: method,
      headers: {
      },
      timeout: timeout * 1000,
    });

    if (context._enableCookieJar) {
      requestParams.cookieJar = context._jar;
    }

    if(tls) {
      requestParams.https = requestParams.https || {};
      requestParams.https = _.extend(requestParams.https, tls);
    }

    let functionNames = _.concat(opts.beforeRequest || [], params.beforeRequest || []);

    async.eachSeries(
      functionNames,
      function iteratee(functionName, next) {
        let fn = template(functionName, context);
        let processFunc = config.processor[fn];
        if (!processFunc) {
          processFunc = function(r, c, e, cb) { return cb(null); };
          console.log(`WARNING: custom function ${fn} could not be found`); // TODO: a 'warning' event
        }

        processFunc(requestParams, context, ee, function(err) {
          if (err) {
            return next(err);
          }
          return next(null);
        });
      },
      function done(err) {
        if (err) {
          debug(err);
          let errCode = err.code || err.message;
          // FIXME: Should not need to have to emit manually here
          ee.emit('error', errCode);
          return callback(err, context);
        }

        // Order of precedence: json set in a function, json set in the script, body set in a function, body set in the script.
        if (requestParams.json) {
          requestParams.json = template(requestParams.json, context);
          delete requestParams.body;
        } else if (requestParams.body) {
          requestParams.body = template(requestParams.body, context);
          // TODO: Warn if body is not a string or a buffer
        }


        // add loop, name & uri elements to be interpolated
        if (context.vars.$loopElement) {
          context.vars.$loopElement = template(context.vars.$loopElement, context);
        }
        if (requestParams.name) {
          requestParams.name = template(requestParams.name, context);
        }
        if (requestParams.uri) {
          requestParams.uri = template(requestParams.uri, context);
        }
        if (requestParams.url) {
          requestParams.url = template(requestParams.url, context);
        }

        // Follow all redirects by default unless specified otherwise
        if (typeof requestParams.followRedirect === 'undefined') {
          requestParams.followRedirect = true;
          requestParams.followAllRedirects = true;
        } else if (requestParams.followRedirect === false) {
          requestParams.followAllRedirects = false;
        }

        // TODO: Use traverse on the entire flow instead

        // Request.js -> Got.js translation
        if (params.qs) {
          requestParams.searchParams = template(params.qs, context);
        }
        if (typeof params.gzip === 'boolean') {
          requestParams.decompress = params.gzip;
        } else {
          requestParams.decompress = false;
        }

        if (params.form) {
          requestParams.form = _.reduce(
            requestParams.form,
            function (acc, v, k) {
              acc[k] = template(v, context);
              return acc;
            },
            {});
        }

        if (params.formData) {
          const f = new FormData();
          requestParams.body = _.reduce(
            requestParams.formData,
            function(acc, v, k) {
              // acc[k] = template(v, context);
              acc.append(k, template(v, context));
              return acc;
            },
            f);
        }

        // Assign default headers then overwrite as needed
        let defaultHeaders = lowcaseKeys(config.defaults.headers || {'user-agent': USER_AGENT});
        const combinedHeaders = _.extend(defaultHeaders, lowcaseKeys(params.headers), lowcaseKeys(requestParams.headers));
        const templatedHeaders = _.mapValues(combinedHeaders, function(v, k, obj) {
          return template(v, context);
        });
        requestParams.headers = templatedHeaders;

        if (typeof params.cookie === 'object' || typeof context._defaultCookie === 'object') {
          const cookie = Object.assign({},
                                       context._defaultCookie,
                                       params.cookie);
          Object.keys(cookie).forEach(function(k) {
            context._jar.setCookieSync(k+'='+template(cookie[k], context), requestParams.url);
          });
        }

        if (typeof requestParams.auth === 'object') {
          requestParams.username = template(requestParams.auth.user, context);
          requestParams.password = template(requestParams.auth.pass, context);
          delete requestParams.auth;
        }

        let url = maybePrependBase(template(requestParams.uri || requestParams.url, context), config);

        if (requestParams.uri) {
          // If a hook function sets requestParams.uri to something, request.js
          // will pick that over .url, so we need to delete it.
          delete requestParams.uri;
        }

        requestParams.url = url;

        // TODO: Bypass proxy if "proxy: false" is set
        requestParams.agent = {
          http: context._httpAgent,
          https: context._httpsAgent
        };

        requestParams.throwHttpErrors = false;

        if (!requestParams.url.startsWith('http')) {
          let err = new Error(`Invalid URL - ${requestParams.url}`);
          ee.emit('error', err.message);
          return callback(err, context);
        }

        function requestCallback(err, res, body) {
          if (err) {
            return;
          }

          if (process.env.DEBUG) {
            let requestInfo = {
              url: requestParams.url,
              method: requestParams.method,
              headers: requestParams.headers
            };

            if (context._jar._jar && typeof context._jar._jar.getCookieStringSync === 'function') {
              requestInfo = Object.assign(requestInfo, {
                cookie: context._jar._jar.getCookieStringSync(requestParams.url)
              });
            }

            if (requestParams.json && typeof requestParams.json !== 'boolean') {
              requestInfo.json = requestParams.json;
            }

            // If "json" is set to an object, it will be serialised and sent as body and the value of the "body" attribute will be ignored.
            if (requestParams.body && typeof requestParams.json !== 'object') {
              if (process.env.DEBUG.indexOf('http:full_body') > -1) {
                // Show the entire body
                requestInfo.body = requestParams.body;
              } else {
                // Only show the beginning of long bodies
                if (typeof requestParams.body === 'string') {
                  requestInfo.body = requestParams.body.substring(0, 512);
                  if (requestParams.body.length > 512) {
                    requestInfo.body += ' ...';
                  }
                } else if (typeof requestParams.body === 'object')  {
                  requestInfo.body = `< ${requestParams.body.constructor.name} >`;
                } else {
                  requestInfo.body = String(requestInfo.body);
                }
              }
            }

            if (requestParams.qs) {
              requestInfo.qs = qs.encode(
                Object.assign(
                  qs.parse(urlparse(requestParams.url).query), requestParams.qs));
            }

            debug('request: %s', JSON.stringify(requestInfo, null, 2));
          }

          debugResponse(JSON.stringify(res.headers, null, 2));
          debugResponse(JSON.stringify(body, null, 2));

          const resForCapture = { headers: res.headers, body: body };
          engineUtil.captureOrMatch(
            params,
            resForCapture,
            context,
            function captured(err, result) {
              if (err) {
                // Run onError hooks and end the scenario:
                runOnErrorHooks(onErrorHandlers, config.processor, err, requestParams, context, ee, function(asyncErr) {
                  ee.emit('error', err.message);
                  return callback(err, context);
                });
              }

              let haveFailedMatches = false;
              let haveFailedCaptures = false;

              if (result !== null) {
                if (Object.keys(result.matches).length > 0 ||
                    Object.keys(result.captures).length > 0) {

                  debug('captures and matches:');
                  debug(result.matches);
                  debug(result.captures);
                }

                // match and capture are strict by default:
                haveFailedMatches = _.some(result.matches, function(v, k) {
                  return !v.success && v.strict !== false;
                });

                haveFailedCaptures = _.some(result.captures, function(v, k) {
                  return v.failed;
                });

                if (haveFailedMatches || haveFailedCaptures) {
                  // TODO: Emit the details of each failed capture/match
                } else {
                  _.each(result.matches, function(v, k) {
                    ee.emit('match', v.success, {
                      expected: v.expected,
                      got: v.got,
                      expression: v.expression,
                      strict: v.strict
                    });
                  });

                  _.each(result.captures, function(v, k) {
                    _.set(context.vars, k, v.value);
                  });
                }
              }

              // Now run afterResponse processors
              let functionNames = _.concat(opts.afterResponse || [], params.afterResponse || []);
              async.eachSeries(
                functionNames,
                function iteratee(functionName, next) {
                  let fn = template(functionName, context);
                  let processFunc = config.processor[fn];
                  if (!processFunc) {
                    // TODO: DRY - #223
                    processFunc = function(r, c, e, cb) { return cb(null); };
                    console.log(`WARNING: custom function ${fn} could not be found`); // TODO: a 'warning' event
                  }

                  // Got does not have res.body which Request.js used to have, so we attach it here:
                  res.body = body;

                  processFunc(requestParams, res, context, ee, function(err) {
                    if (err) {
                      return next(err);
                    }
                    return next(null);
                  });
                }, function(err) {
                  if (err) {
                    debug(err);
                    ee.emit('error', err.code || err.message);
                    return callback(err, context);
                  }

                  if (haveFailedMatches || haveFailedCaptures) {
                    // FIXME: This means only one error in the report even if multiple captures failed for the same request.
                    return callback(new Error('Failed capture or match'), context);
                  }

                  return callback(null, context);
                });
            });
        }

        // If we aren't processing the full response, we don't need the
        // callback:
        let maybeCallback;
        if (typeof requestParams.capture === 'object' ||
            typeof requestParams.match === 'object' ||
            requestParams.afterResponse ||
            (typeof opts.afterResponse === 'object' && opts.afterResponse.length > 0) ||
            process.env.DEBUG) {
          maybeCallback = requestCallback;
        }

        if(!requestParams.url) {
          let err = new Error('an URL must be specified');

          // Run onError hooks and end the scenario
          runOnErrorHooks(onErrorHandlers, config.processor, err, requestParams, context, ee, function(asyncErr) {
            ee.emit('error', err.message);
            return callback(err, context);
          });
        }

        requestParams.retry = 0; // disable retries - ignored when using streams
        const startedAt = process.hrtime(); // TODO: use built-in timing API

        request(requestParams)
          .on('request', function(req) {
            debugRequests('request start: %s', req.path);
            ee.emit('request');
            req.on('response', function(res) {
              self._handleResponse(requestParams.url, res, ee, context, maybeCallback, startedAt, callback);
            });
          }).on('error', function(err, body, res) {
            if (err.name === 'HTTPError') {
              return;
            }
            // this is an ENOTFOUND, ECONNRESET etc
            debug(err);
            // Run onError hooks and end the scenario:
            runOnErrorHooks(onErrorHandlers, config.processor, err, requestParams, context, ee, function(asyncErr) {
              let errCode = err.code || err.message;
              ee.emit('error', errCode);
              return callback(err, context);
            });
          })
        .catch((gotErr) => {
          // TODO: Handle the error properly with run hooks
          ee.emit('error', gotErr.code || gotErr.message);
          return callback(gotErr, context);
        });
      }); // eachSeries
  };

  return f;
};

HttpEngine.prototype._handleResponse = function(url, res, ee, context, maybeCallback, startedAt, callback) {
  res = decompressResponse(res);

  if (!context._enableCookieJar) {
    const rawCookies = res.headers['set-cookie'];
    if (rawCookies) {
      context._enableCookieJar = true;
      rawCookies.forEach(function(cookieString) {
        context._jar.setCookieSync(cookieString, url);
      });
    }
  }

  ee.emit('response', res.timings.phases.firstByte * 1e6, res.statusCode, context._uid);
  let body = '';
  if (maybeCallback) {
    res.on('data', (d) => {
      body += d;
    });
  }

  res.on('end', () => {
    context._successCount++;
    if (!maybeCallback) {
      callback(null, context);
    } else {
      maybeCallback(null, res, body);
    }
  });

}

HttpEngine.prototype.setInitialContext = function(initialContext) {
  initialContext._successCount = 0;

  initialContext._defaultStrictCapture = this.config.defaults.strictCapture;

  initialContext._jar = new tough.CookieJar();
  initialContext._enableCookieJar = false;
  // If a default cookie is set, we will use the jar straightaway:
  if (typeof this.config.defaults.cookie === 'object') {
    initialContext._defaultCookie = this.config.defaults.cookie;
    initialContext._enableCookieJar = true;
  }

  if (this.config.http && typeof this.config.http.pool !== 'undefined') {
    // Reuse common agents (created in the engine instance constructor)
    initialContext._httpAgent = this._httpAgent;
    initialContext._httpsAgent = this._httpsAgent;
  } else {
    // Create agents just for this VU
    const agentOpts = Object.assign(DEFAULT_AGENT_OPTIONS, {
      maxSockets: 1,
      maxFreeSockets: 1
    });

    const agents = createAgents({
      http: process.env.HTTP_PROXY,
      https: process.env.HTTPS_PROXY
    }, agentOpts);

    initialContext._httpAgent = agents.httpAgent;
    initialContext._httpsAgent = agents.httpsAgent;
  }
  return initialContext;
};

HttpEngine.prototype.compile = function compile(tasks, scenarioSpec, ee) {
  let self = this;

  return function scenario(initialContext, callback) {
    initialContext = self.setInitialContext(initialContext);
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
        if (err) {
          //ee.emit('error', err.message);
          return callback(err, context);
        } else {
          return callback(null, context);
        }
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

function runOnErrorHooks(functionNames, functions, err, requestParams, context, ee, callback) {
  async.eachSeries(functionNames, function iteratee(functionName, next) {
    let processFunc = functions[functionName];
    processFunc(err, requestParams, context, ee, function(asyncErr) {
      if (asyncErr) {
        return next(asyncErr);
      }
      return next(null);
    });
  }, function done(asyncErr) {
    return callback(asyncErr);
  });
}
