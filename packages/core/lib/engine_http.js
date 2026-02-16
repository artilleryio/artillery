/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const async = require('async');
const _ = require('lodash');
const tough = require('tough-cookie');
const debug = require('debug')('http');
const debugRequests = require('debug')('http:request');
const debugResponse = require('debug')('http:response');
const USER_AGENT = 'Artillery (https://artillery.io)';
const engineUtil = require('@artilleryio/int-commons').engine_util;
const ensurePropertyIsAList = engineUtil.ensurePropertyIsAList;
const template = engineUtil.template;
const qs = require('node:querystring');
const filtrex = require('filtrex');
const urlparse = require('node:url').parse;
const FormData = require('form-data');
const HttpAgent = require('agentkeepalive');
const { HttpsAgent } = HttpAgent;
const { HttpProxyAgent, HttpsProxyAgent } = require('hpagent');
const decompressResponse = require('decompress-response');
const fs = require('node:fs');
const path = require('node:path');

const { promisify, callbackify } = require('node:util');

const crypto = require('node:crypto');

module.exports = HttpEngine;

const GOT_OPTION_NAMES = [
  'url',
  'searchParams',
  'method',
  'headers',
  'body',
  'json',
  'form',
  'allowGetBody',
  'timeout',
  'retry',
  'encoding',
  'cookieJar',
  'followRedirect',
  'maxRedirects',
  'decompress',
  'http2',
  'agent',
  'username',
  'password',
  'https',
  'throwHttpErrors'
];

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
    result.httpsAgent = new HttpsProxyAgent(
      Object.assign({ proxy: proxies.https }, agentOpts)
    );

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

  if (typeof this.config.http === 'undefined') {
    this.config.http = {};
  }

  if (typeof this.config.http.defaults === 'undefined') {
    this.config.http.defaults = {};
  }

  if (typeof this.config.http.cookieJarOptions === 'undefined') {
    this.config.http.cookieJarOptions = {};
  }

  // If config.http.pool is set, create & reuse agents for all requests (with
  // max sockets set). That's what we're done here.
  // If config.http.pool is not set, we create new agents for each virtual user.
  // That's done when the VU is initialized.

  this.maxSockets = Infinity;
  if (script.config.http?.pool) {
    this.maxSockets = Number(script.config.http.pool);
  }
  const agentOpts = Object.assign(DEFAULT_AGENT_OPTIONS, {
    maxSockets: this.maxSockets,
    maxFreeSockets: this.maxSockets
  });

  const agents = createAgents(
    {
      http: process.env.HTTP_PROXY,
      https: process.env.HTTPS_PROXY
    },
    agentOpts
  );

  this._httpAgent = agents.httpAgent;
  this._httpsAgent = agents.httpsAgent;

  if (
    (script.config.http && script.config.http.extendedMetrics === true) ||
    global.artillery?.runtimeOptions.extendedHTTPMetrics
  ) {
    this.extendedHTTPMetrics = true;
  }
}

HttpEngine.prototype.init = async function () {
  this.request = (await import('got')).default;
};

HttpEngine.prototype.createScenario = function (scenarioSpec, ee) {
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
    (hookFunctionName) => ({ function: hookFunctionName })
  );
  const afterScenarioFns = _.map(
    scenarioSpec.afterScenario,
    (hookFunctionName) => ({ function: hookFunctionName })
  );

  const newFlow = beforeScenarioFns.concat(
    scenarioSpec.flow.concat(afterScenarioFns)
  );

  scenarioSpec.flow = newFlow;

  const tasks = _.map(scenarioSpec.flow, (rs) =>
    this.step(rs, ee, {
      beforeRequest: scenarioSpec.beforeRequest,
      afterResponse: scenarioSpec.afterResponse,
      onError: scenarioSpec.onError
    })
  );

  return this.compile(tasks, scenarioSpec, ee);
};

HttpEngine.prototype.step = function step(requestSpec, ee, opts) {
  opts = opts || {};
  const self = this;
  const config = this.config;

  if (requestSpec.loop) {
    const steps = _.map(requestSpec.loop, (rs) => self.step(rs, ee, opts));

    return engineUtil.createLoopWithCount(requestSpec.count || -1, steps, {
      loopValue: requestSpec.loopValue || '$loopCount',
      loopElement: requestSpec.loopElement || '$loopElement',
      overValues: requestSpec.over,
      whileTrue: self.config.processor
        ? self.config.processor[requestSpec.whileTrue]
        : undefined
    });
  }

  if (requestSpec.parallel) {
    const steps = _.map(requestSpec.parallel, (rs) => self.step(rs, ee, opts));

    return engineUtil.createParallel(steps, {
      limitValue: requestSpec.limit
    });
  }

  if (typeof requestSpec.think !== 'undefined') {
    return engineUtil.createThink(
      requestSpec,
      self.config.http.defaults.think || self.config.defaults.think
    );
  }

  if (typeof requestSpec.log !== 'undefined') {
    return (context, callback) => {
      console.log(template(requestSpec.log, context));
      return process.nextTick(() => {
        callback(null, context);
      });
    };
  }

  if (requestSpec.function) {
    return (context, callback) => {
      const processFunc = self.config.processor[requestSpec.function];
      if (processFunc) {
        let f;
        if (processFunc.constructor.name === 'Function') {
          f = processFunc;
        } else {
          f = callbackify(processFunc);
        }
        return f(context, ee, (hookErr) => callback(hookErr, context));
      } else {
        debug(`Function "${requestSpec.function}" not defined`);
        debug('processor: %o', self.config.processor);
        ee.emit('error', `Undefined function "${requestSpec.function}"`);
        return process.nextTick(() => {
          callback(null, context);
        });
      }
    };
  }

  const f = (context, callback) => {
    const method = _.keys(requestSpec)[0].toUpperCase();
    const params = requestSpec[method.toLowerCase()];

    const onErrorHandlers = opts.onError; // only scenario-lever onError handlers are supported

    // A special case for when "url" attribute is missing. We need to check for
    // it manually as request.js won't emit an 'error' event when the argument
    // is missing.
    // This will be obsoleted by better script validation.
    if (!params.url && !params.uri) {
      const err = new Error('an URL must be specified');
      return callback(err, context);
    }

    const tls = config.tls || {};
    const timeout = config.timeout || _.get(config, 'http.timeout') || 10;

    if (!engineUtil.isProbableEnough(params)) {
      return process.nextTick(() => {
        callback(null, context);
      });
    }

    if (!_.isUndefined(params.ifTrue)) {
      let result;
      try {
        const cond = _.has(config.processor, params.ifTrue)
          ? config.processor[params.ifTrue]
          : filtrex(params.ifTrue);
        result = cond(context.vars);
      } catch (err) {
        debug('ifTrue error:', err);
        result = 1; // if the expression is incorrect, just proceed
      }
      if (!result) {
        return process.nextTick(() => {
          callback(null, context);
        });
      }
    }

    // Run beforeRequest processors (scenario-level ones too)
    const requestParams = _.extend(_.clone(params), {
      url: maybePrependBase(params.url || params.uri, config), // *NOT* templating here
      method: method,
      timeout: timeout,
      uuid: crypto.randomUUID()
    });

    if (context._enableCookieJar) {
      requestParams.cookieJar = context._jar;
    }

    if (tls) {
      requestParams.https = requestParams.https || {};
      requestParams.https = _.extend(requestParams.https, tls);
    }

    const functionNames = _.concat(
      opts.beforeRequest || [],
      params.beforeRequest || []
    );

    async.eachSeries(
      functionNames,
      function iteratee(functionName, next) {
        const fn = template(functionName, context);
        let processFunc = config.processor[fn];
        if (!processFunc) {
          processFunc = (_r, _c, _e, cb) => cb(null);
          console.log(`WARNING: custom function ${fn} could not be found`); // TODO: a 'warning' event
        }

        if (processFunc.constructor.name === 'Function') {
          processFunc(requestParams, context, ee, (err) => {
            if (err) {
              return next(err);
            }
            return next(null);
          });
        } else {
          processFunc(requestParams, context, ee).then(next).catch(next);
        }
      },
      function done(err) {
        if (err) {
          debug(err);
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
          context.vars.$loopElement = template(
            context.vars.$loopElement,
            context
          );
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
        }

        // TODO: Use traverse on the entire flow instead

        // Request.js -> Got.js translation
        if (params.qs) {
          requestParams.searchParams = qs.stringify(
            template(params.qs, context)
          );
        }

        if (typeof params.gzip === 'boolean') {
          requestParams.decompress = params.gzip;
        } else {
          requestParams.decompress = true;
        }

        if (params.form) {
          requestParams.form = _.reduce(
            requestParams.form,
            (acc, v, k) => {
              acc[k] = template(v, context);
              return acc;
            },
            {}
          );
        }

        if (params.formData) {
          let fileUpload;
          const f = new FormData();
          requestParams.body = _.reduce(
            requestParams.formData,
            (acc, v, k) => {
              let V = template(v, context);
              let options;
              if (V && _.isPlainObject(V)) {
                if (V.contentType) {
                  options = { contentType: V.contentType };
                }
                if (V.fromFile) {
                  const absPath = path.resolve(
                    path.dirname(context.vars.$scenarioFile),
                    V.fromFile
                  );
                  fileUpload = absPath;
                  V = fs.createReadStream(absPath);
                } else if (V.value) {
                  V = V.value;
                }
              }
              acc.append(k, V, options);
              return acc;
            },
            f
          );
          if (params.setContentLengthHeader && fileUpload) {
            try {
              requestParams.headers = requestParams.headers || {};
              requestParams.headers['content-length'] =
                fs.statSync(fileUpload).size;
            } catch (err) {
              debug(`stat() on ${fileUpload} failed with ${err}`);
            }
          }
        }

        // Assign default headers then overwrite as needed
        const defaultHeaders = lowcaseKeys(
          config.http.defaults.headers ||
            config.defaults.headers || { 'user-agent': USER_AGENT }
        );
        const combinedHeaders = _.extend(
          defaultHeaders,
          lowcaseKeys(params.headers),
          lowcaseKeys(requestParams.headers)
        );
        const templatedHeaders = _.mapValues(combinedHeaders, (v, _k, _obj) =>
          template(v, context)
        );
        requestParams.headers = templatedHeaders;

        // We compute the url here so that the cookies are set properly afterwards
        const url = maybePrependBase(
          template(requestParams.uri || requestParams.url, context),
          config
        );

        if (requestParams.uri) {
          // If a hook function sets requestParams.uri to something, request.js
          // will pick that over .url, so we need to delete it.
          delete requestParams.uri;
        }

        requestParams.url = url;

        if (
          typeof requestParams.cookie === 'object' ||
          typeof context._defaultCookie === 'object'
        ) {
          requestParams.cookieJar = context._jar;
          const cookie = Object.assign(
            {},
            context._defaultCookie,
            requestParams.cookie
          );
          Object.keys(cookie).forEach((k) => {
            context._jar.setCookieSync(
              `${k}=${template(cookie[k], context)}`,
              requestParams.url
            );
          });
        }

        if (typeof requestParams.auth === 'object') {
          requestParams.username = template(requestParams.auth.user, context);
          requestParams.password = template(requestParams.auth.pass, context);
          delete requestParams.auth;
        }

        // TODO: Bypass proxy if "proxy: false" is set
        requestParams.agent = {
          http: context._httpAgent,
          https: context._httpsAgent
        };

        requestParams.throwHttpErrors = false;

        if (!requestParams.url || !requestParams.url.startsWith('http')) {
          const err = new Error(`Invalid URL - ${requestParams.url}`);
          return callback(err, context);
        }

        function responseProcessor(isLast, res, body, done) {
          if (process.env.DEBUG) {
            let requestInfo = {
              url: requestParams.url,
              method: requestParams.method,
              headers: requestParams.headers
            };

            if (
              context._jar._jar &&
              typeof context._jar._jar.getCookieStringSync === 'function'
            ) {
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
                } else if (typeof requestParams.body === 'object') {
                  requestInfo.body = `< ${requestParams.body.constructor.name} >`;
                } else {
                  requestInfo.body = String(requestInfo.body);
                }
              }
            }

            if (requestParams.qs) {
              requestInfo.qs = qs.encode(
                Object.assign(
                  qs.parse(urlparse(requestParams.url).query),
                  template(requestParams.qs, context)
                )
              );
            }

            debug('request: %s', JSON.stringify(requestInfo, null, 2));
          }

          debugResponse(JSON.stringify(res.headers, null, 2));
          debugResponse(JSON.stringify(body, null, 2));

          // capture/match/response hooks run only for last request in a task
          if (!isLast) {
            return done(null, context);
          }

          const resForCapture = { headers: res.headers, body: body };

          engineUtil.captureOrMatch(
            params,
            resForCapture,
            context,
            function captured(err, result) {
              if (err) {
                // Run onError hooks and end the scenario:
                runOnErrorHooks(
                  onErrorHandlers,
                  config.processor,
                  err,
                  requestParams,
                  context,
                  ee,
                  (_asyncErr) => done(err, context)
                );
              }

              let haveFailedMatches = false;
              let haveFailedCaptures = false;

              if (result !== null) {
                ee.emit('trace:http:capture', result, requestParams.uuid);
                if (
                  Object.keys(result.matches).length > 0 ||
                  Object.keys(result.captures).length > 0
                ) {
                  debug('captures and matches:');
                  debug(result.matches);
                  debug(result.captures);
                }

                // match and capture are strict by default:
                haveFailedMatches = _.some(
                  result.matches,
                  (v, _k) => !v.success && v.strict !== false
                );

                haveFailedCaptures = _.some(
                  result.captures,
                  (v, _k) => v.failed
                );

                if (haveFailedMatches || haveFailedCaptures) {
                  // TODO: Emit the details of each failed capture/match
                } else {
                  _.each(result.matches, (v, _k) => {
                    ee.emit('match', v.success, {
                      expected: v.expected,
                      got: v.got,
                      expression: v.expression,
                      strict: v.strict
                    });
                  });

                  _.each(result.captures, (v, k) => {
                    _.set(context.vars, k, v.value);
                  });
                }
              }

              // Now run afterResponse processors
              const functionNames = _.concat(
                opts.afterResponse || [],
                params.afterResponse || []
              );
              async.eachSeries(
                functionNames,
                function iteratee(functionName, next) {
                  const fn = template(functionName, context);
                  let processFunc = config.processor[fn];
                  if (!processFunc) {
                    // TODO: DRY - #223
                    processFunc = (_r, _res, _c, _e, cb) => cb(null);
                    console.log(
                      `WARNING: custom function ${fn} could not be found`
                    ); // TODO: a 'warning' event
                  }

                  // Got does not have res.body which Request.js used to have, so we attach it here:
                  res.body = body;

                  if (processFunc.constructor.name === 'Function') {
                    processFunc(requestParams, res, context, ee, (err) => {
                      if (err) {
                        return next(err);
                      }
                      return next(null);
                    });
                  } else {
                    processFunc(requestParams, res, context, ee)
                      .then(next)
                      .catch(next);
                  }
                },
                (err) => {
                  if (err) {
                    debug(err);
                    return done(err, context);
                  }

                  if (haveFailedMatches || haveFailedCaptures) {
                    // FIXME: This means only one error in the report even if multiple captures failed for the same request.
                    return done(new Error('Failed capture or match'), context);
                  }
                  return done(null, context);
                }
              );
            }
          );
        }

        let needToProcessResponse = false;
        if (
          typeof requestParams.capture === 'object' ||
          typeof requestParams.match === 'object' ||
          requestParams.afterResponse ||
          (typeof opts.afterResponse === 'object' &&
            opts.afterResponse.length > 0) ||
          process.env.DEBUG
        ) {
          needToProcessResponse = true;
        }

        if (!requestParams.url) {
          const err = new Error('an URL must be specified');

          // Run onError hooks and end the scenario
          runOnErrorHooks(
            onErrorHandlers,
            config.processor,
            err,
            requestParams,
            context,
            ee,
            (_asyncErr) => callback(err, context)
          );
        }

        requestParams.retry = { limit: 0 }; // disable retries - ignored when using streams
        // Convert scalar seconds to Got v14 timeout object right before request
        const gotOptions = _.pick(requestParams, GOT_OPTION_NAMES);
        gotOptions.timeout = { response: requestParams.timeout * 1000 };

        let totalDownloaded = 0;
        self
          .request(gotOptions)
          .on('request', (req) => {
            ee.emit('trace:http:request', requestParams, requestParams.uuid);

            debugRequests('request start: %s', req.path);
            ee.emit('counter', 'http.requests', 1);
            ee.emit('rate', 'http.request_rate');
            req.on('response', (res) => {
              res.on('end', () => {
                ee.emit('counter', 'http.downloaded_bytes', totalDownloaded);
              });
              ee.emit('trace:http:response', res, requestParams.uuid);
              self._handleResponse(
                requestParams,
                res,
                ee,
                context,
                needToProcessResponse ? responseProcessor : null,
                callback
              );
            });
          })
          .on('downloadProgress', (progress) => {
            totalDownloaded = progress.total;
          })
          .on('error', (err, _body, _res) => {
            ee.emit('trace:http:error', err, requestParams.uuid);
            if (err.name === 'HTTPError') {
              return;
            }
            // this is an ENOTFOUND, ECONNRESET etc
            debug(err);
            // Run onError hooks and end the scenario:
            runOnErrorHooks(
              onErrorHandlers,
              config.processor,
              err,
              requestParams,
              context,
              ee,
              (_asyncErr) => callback(err, context)
            );
          })
          .catch((gotErr) => {
            // TODO: Handle the error properly with run hooks
            debug(gotErr);
            runOnErrorHooks(
              onErrorHandlers,
              config.processor,
              gotErr,
              requestParams,
              context,
              ee,
              (_asyncErr) => callback(gotErr, context)
            );
          });
      }
    ); // eachSeries
  };

  return f;
};

HttpEngine.prototype._handleResponse = function (
  requestParams,
  res,
  ee,
  context,
  responseProcessor,
  callback
) {
  const url = requestParams.url;

  if (requestParams.decompress) {
    res = decompressResponse(res);
  }

  const code = res.statusCode;
  if (!context._enableCookieJar) {
    const rawCookies = res.headers['set-cookie'];
    if (rawCookies) {
      context._enableCookieJar = true;
      rawCookies.forEach((cookieString) => {
        try {
          context._jar.setCookieSync(cookieString, url);
        } catch (err) {
          debug(
            `Could not parse cookieString "${cookieString}" from response header, skipping it`
          );
          debug(err);
          ee.emit('error', 'cookie_parse_error_invalid_cookie');
        }
      });
    }
  }

  ee.emit('counter', `http.codes.${code}`, 1);
  ee.emit('counter', 'http.responses', 1);
  // ee.emit('rate', 'http.response_rate');
  ee.emit('histogram', 'http.response_time', res.timings.phases.firstByte);

  const statusCode = res.statusCode;
  if (statusCode >= 200 && statusCode < 300) {
    ee.emit(
      'histogram',
      'http.response_time.2xx',
      res.timings.phases.firstByte
    );
  } else if (statusCode >= 300 && statusCode < 400) {
    ee.emit(
      'histogram',
      'http.response_time.3xx',
      res.timings.phases.firstByte
    );
  } else if (statusCode >= 400 && statusCode < 500) {
    ee.emit(
      'histogram',
      'http.response_time.4xx',
      res.timings.phases.firstByte
    );
  } else if (statusCode >= 500 && statusCode < 600) {
    ee.emit(
      'histogram',
      'http.response_time.5xx',
      res.timings.phases.firstByte
    );
  }

  if (this.extendedHTTPMetrics) {
    ee.emit('histogram', 'http.dns', res.timings.phases.dns);
    ee.emit('histogram', 'http.tcp', res.timings.phases.tcp);
    ee.emit('histogram', 'http.tls', res.timings.phases.tls);
  }
  let body = '';
  if (responseProcessor) {
    res.on('data', (d) => {
      body += d;
    });
  } else {
    res.on('data', () => {});
  }

  res.on('end', () => {
    if (this.extendedHTTPMetrics) {
      ee.emit('histogram', 'http.total', res.timings.phases.total);
    }

    context._successCount++;

    // config.defaults won't be taken into account for this
    const isLastRequest = lastRequest(res, requestParams);

    if (responseProcessor) {
      responseProcessor(isLastRequest, res, body, (processResponseErr) => {
        // capture/match returned an error object, or a hook function returned
        // with an error
        if (processResponseErr) {
          return callback(processResponseErr, context);
        }

        if (isLastRequest) {
          return callback(null, context);
        }
      });
    } else {
      if (isLastRequest) {
        return callback(null, context);
      }
    }
  });
};

function lastRequest(res, requestParams) {
  // We're done when:
  // - 3xx response and not following redirects
  // - not a 3xx response

  return (
    (res.statusCode >= 300 &&
      res.statusCode < 400 &&
      !requestParams.followRedirect) ||
    res.statusCode < 300 ||
    res.statusCode >= 400
  );
}

HttpEngine.prototype.setInitialContext = function (initialContext) {
  initialContext._successCount = 0;

  initialContext._defaultStrictCapture = true;
  if (
    this.config.http?.defaults?.strictCapture === false ||
    this.config.defaults?.strictCapture === false
  ) {
    initialContext._defaultStrictCapture = false;
  }

  initialContext._jar = new tough.CookieJar(
    null,
    this.config.http.cookieJarOptions
  );

  initialContext._enableCookieJar = false;
  // If a default cookie is set, we will use the jar straightaway:
  if (
    typeof this.config.http.defaults.cookie === 'object' ||
    typeof this.config.defaults.cookie === 'object'
  ) {
    initialContext._defaultCookie =
      this.config.http.defaults.cookie || this.config.defaults.cookie;
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

    const agents = createAgents(
      {
        http: process.env.HTTP_PROXY,
        https: process.env.HTTPS_PROXY
      },
      agentOpts
    );

    initialContext._httpAgent = agents.httpAgent;
    initialContext._httpsAgent = agents.httpsAgent;
  }
  return initialContext;
};

HttpEngine.prototype.compile = function compile(tasks, _scenarioSpec, ee) {
  const self = this;

  return async function scenario(initialContext, callback) {
    initialContext = self.setInitialContext(initialContext);

    ee.emit('started');
    let context = initialContext;
    for (const task of tasks) {
      try {
        context = await promisify(task)(context);
      } catch (taskErr) {
        ee.emit('error', taskErr.code || taskErr.message);
        if (callback) {
          return callback(taskErr, context);
        }
        throw taskErr;
      }
    }
    if (callback) {
      return callback(null, context);
    }
    return context;
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
  return _.transform(h, (result, v, k) => {
    result[k.toLowerCase()] = v;
  });
}

function runOnErrorHooks(
  functionNames,
  functions,
  err,
  requestParams,
  context,
  ee,
  callback
) {
  async.eachSeries(
    functionNames,
    function iteratee(functionName, next) {
      const processFunc = functions[functionName];
      processFunc(err, requestParams, context, ee, (asyncErr) => {
        if (asyncErr) {
          return next(asyncErr);
        }
        return next(null);
      });
    },
    function done(asyncErr) {
      return callback(asyncErr);
    }
  );
}
