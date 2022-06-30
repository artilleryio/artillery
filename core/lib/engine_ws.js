/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const async = require('async');
const _ = require('lodash');
const WebSocket = require('ws');
const HttpsProxyAgent = require('https-proxy-agent');
const debug = require('debug')('ws');
const url = require('url');
const engineUtil = require('./engine_util');
const template = engineUtil.template;
const { promisify } = require('util');

const sleep = require('../../lib/util/sleep');

module.exports = WSEngine;

function WSEngine(script) {
  this.config = script.config;
}

WSEngine.prototype.createScenario = function (scenarioSpec, ee) {
  const self = this;
  const tasks = _.map(scenarioSpec.flow, function (rs) {
    if (rs.think) {
      return engineUtil.createThink(
        rs,
        _.get(self.config, 'defaults.think', {})
      );
    }

    return self.step(rs, ee);
  });

  return self.compile(tasks, scenarioSpec.flow, ee);
};

function emitMatches(results, ee) {
  _.each(results.matches, function (v) {
    ee.emit('match', v.success, {
      expected: v.expected,
      got: v.got,
      expression: v.expression,
      strict: v.strict
    });
  });
}

function applyCaptures(results, context) {
  _.each(results.captures, function (v, k) {
    _.set(context.vars, k, v.value);
  });
}

async function checkMatch(params, data, context) {
  // TODO: Only try to parse JSON if it's a JSONPath/JMESPath expression
  let response;
  try {
    response = { body: JSON.parse(data) };
  } catch (err) {
    response = { body: event.data };
  }

  const captureOrMatch = promisify(engineUtil.captureOrMatch);
  try {
    const result = await captureOrMatch(params, response, context);
    const { captures = {}, matches = {} } = result;

    debug('matches: ', matches);
    debug('captures: ', captures);

    // match and capture are strict by default:
    const haveFailedMatches = _.some(result.matches, function (v) {
      return !v.success && v.strict !== false;
    });

    const haveFailedCaptures = _.some(result.captures, function (v) {
      return v.failed;
    });

    if ((haveFailedMatches || haveFailedCaptures)) {
      return [new Error('Failed matches or captures'), result];
    } else {
      return [null, result];
    }
  } catch (err) {
    return [err, null];
  }
}

function getMessageHandler(isWait, context, params, ee, callback) {
  return function messageHandler(event) {
    debug({isWait, params});
    const { data } = event;
    debug('WS receive: %s', data);

    if (!data && !isWait) {
      return callback(new Error('Empty response from WS server'), context);
    }

    let fauxResponse;
    try {
      fauxResponse = { body: JSON.parse(data) };
    } catch (err) {
      fauxResponse = { body: event.data };
    }

    engineUtil.captureOrMatch(
      params,
      fauxResponse,
      context,
      function captured(err, result) {
        if (err && !isWait) {
          ee.emit('error', err.message || err.code);
          return callback(err, context);
        }

        const { captures = {}, matches = {} } = result;

        debug('matches: ', matches);
        debug('captures: ', captures);

        // match and capture are strict by default:
        const haveFailedMatches = _.some(result.matches, function (v) {
          return !v.success && v.strict !== false;
        });

        const haveFailedCaptures = _.some(result.captures, function (v) {
          return v.failed;
        });

        if ((haveFailedMatches || haveFailedCaptures)) {
          if(!isWait) {
            // TODO: Emit the details of each failed capture/match
            return callback(new Error('Failed capture or match'), context);
          } else {
            debug('message not matched by wait, continue waiting');
          }
        } else {
          _.each(result.matches, function (v) {
            ee.emit('match', v.success, {
              expected: v.expected,
              got: v.got,
              expression: v.expression,
              strict: v.strict
            });
          });

          _.each(result.captures, function (v, k) {
            _.set(context.vars, k, v.value);
          });
          return callback(null, context);
        }
      }
    );
  };
}

WSEngine.prototype.step = function (requestSpec, ee) {
  const self = this;

  if (requestSpec.loop) {
    const steps = _.map(requestSpec.loop, function (rs) {
      return self.step(rs, ee);
    });

    return engineUtil.createLoopWithCount(requestSpec.count || -1, steps, {
      loopValue: requestSpec.loopValue || '$loopCount',
      overValues: requestSpec.over,
      whileTrue: self.config.processor
        ? self.config.processor[requestSpec.whileTrue]
        : undefined
    });
  }

  if (requestSpec.think) {
    return engineUtil.createThink(
      requestSpec,
      _.get(self.config, 'defaults.think', {})
    );
  }

  if (requestSpec.function) {
    return function (context, callback) {
      const processFunc = self.config.processor[requestSpec.function];
      if (processFunc) {
        processFunc(context, ee, function () {
          return callback(null, context);
        });
      }
    };
  }

  if (requestSpec.log) {
    return function (context, callback) {
      console.log(template(requestSpec.log, context));
      return process.nextTick(function () {
        callback(null, context);
      });
    };
  }

  if (requestSpec.connect) {
    return function (context, callback) {
      return process.nextTick(function () {
        callback(null, context);
      });
    };
  }

  const f = function (context, callback) {
    const params = requestSpec.send || requestSpec.wait;
    const isWait = typeof requestSpec.wait !== 'undefined';

    // match exists on a string, so check it's not one first
    const captureOrMatch = !_.isString(params) && (params.capture || params.match);

    // Backwards compatible with previous version of `send` API
    let payload = template(captureOrMatch ? params.payload : params, context);

    // TODO: Make configurable
    const DEFAULT_WAIT_TIMEOUT = 120;

    if (captureOrMatch) {
      if (isWait) {
        context._deferredChecks.push({
          deadline: Date.now() + parseInt(params.timeout || DEFAULT_WAIT_TIMEOUT, 10) * 1000,
          processed: false,
          spec: params,
        });
      } else {

        debug({captureOrMatch, params});

        // TODO: Assert that this is null
        context._immediateCheck = {
          deadline: Date.now() + parseInt(params.timeout || DEFAULT_WAIT_TIMEOUT, 10) * 1000,
          processed: false,
          spec: params,
        };
      }
    }

    if (payload) {
      if (typeof payload === 'object') {
        payload = JSON.stringify(payload);
      } else {
        payload = payload.toString();
      }

      debug('WS send: %s', payload);

      context.ws.send(payload, function (err) {
        ee.emit('counter', 'websocket.messages_sent', 1);
        ee.emit('rate', 'websocket.send_rate');

        if (err) {
          debug(err);
          ee.emit('error', err);
          return callback(err, context);
        }
        return callback (null, context);
      });
    } else {
      return callback(null, context);
    }
  };

  return f;
};

function getWsOptions(config) {
  const options = getWsConfig(config);
  const subprotocols = _.get(config, 'ws.subprotocols', []);
  const headers = _.get(config, 'ws.headers', {});

  const subprotocolHeader = _.find(headers, (value, headerName) => {
    return headerName.toLowerCase() === 'sec-websocket-protocol';
  });

  if (typeof subprotocolHeader !== 'undefined') {
    // NOTE: subprotocols defined via config.ws.subprotocols take precedence:
    subprotocols.push(...subprotocolHeader.split(',').map((s) => s.trim()));
  }

  return { options, subprotocols };
}

function getWsInstance(config, scenarioSpec, context, cb) {
  let wsArgs = {
    ...getWsOptions(config),
    target: config.target
  };
  const [{ connect }] = scenarioSpec;

  if (connect) {
    if (connect.function && config.processor[connect.function]) {
      const processFn = config.processor[connect.function];

      return processFn(wsArgs, context, (err) => {
        if (err) {
          debug('connect.function', err);
          return cb(err, null);
        }

        context.wsArgs = wsArgs;

        return cb(null, context);
      });
    } else if (_.isPlainObject(connect)) {
      const {
        target = config.target,
        headers = _.get(config, 'ws.headers', {}),
        subprotocols = _.get(config, 'ws.subprotocols', []),
        ...instanceConfig
      } = connect;

      const opt = getWsOptions({
        tls: config.tls,
        ws: { subprotocols, headers, ...instanceConfig }
      });

      wsArgs = {
        target: template(target, context),
        ...opt
      };
    } else {
      wsArgs.target = template(connect, context);
    }
  }

  debug('new WebSocket instance:', wsArgs);

  context.wsArgs = wsArgs;

  return cb(null, context);
}

WSEngine.prototype.compile = function (tasks, scenarioSpec, ee) {
  const config = this.config;

  return function scenario(initialContext, callback) {
    function zero(cb) {
      ee.emit('started');

      getWsInstance(config, scenarioSpec, initialContext, cb);
    }

    function one(context, cb) {
      const { wsArgs, ...contextWithoutWsArgs } = context;
      const ws = new WebSocket(
        wsArgs.target,
        wsArgs.subprotocols,
        wsArgs.options
      );

      ws.on('open', function () {
        contextWithoutWsArgs.ws = ws;

        contextWithoutWsArgs._deferredChecks = []; // append only
        /*
          deadline -- timestamp, default is 120s
          processed -- boolean (either matched or expired, not taken into account anymore)
          spec -- object
         */
        contextWithoutWsArgs._immediateCheck = null;
        contextWithoutWsArgs._processingImmediate = false;

        setInterval(() => {
          for(const checkSpec of contextWithoutWsArgs._deferredChecks) {
            const now = Date.now();
            if (!checkSpec.processed && (checkSpec.deadline < now)) {              
              checkSpec.processed = true;
              checkSpec.timedout = true;
              ee.emit('error', 'wait_timeout');
            }
          }

          if (contextWithoutWsArgs._immediateCheck && contextWithoutWsArgs._immediateCheck.deadline < Date.now()) {
            contextWithoutWsArgs._immediateCheck = null;
            contextWithoutWsArgs._immediateCheckTimedout = true;
            ee.emit('error', 'wait_timeout');
          }
        }, 250).unref();

        return cb(null, contextWithoutWsArgs);
      });

      ws.on('message', async function (data) {
        debug('WS receive: %s', data, Date.now());

        ee.emit ('counter', 'websocket.message_received', 1);

        if (contextWithoutWsArgs._immediateCheck && !contextWithoutWsArgs._processingImmediate) {
          contextWithoutWsArgs._processingImmediate = true;
          const [ err, results ] = await checkMatch(contextWithoutWsArgs._immediateCheck.spec, data, context);
          if (err) {
            ee.emit('error', 'failed_capture_or_match');
          } else {
            emitMatches(results, ee);
            applyCaptures(results, contextWithoutWsArgs);
          }

          contextWithoutWsArgs._immediateCheck = null;
          contextWithoutWsArgs._processingImmediate = false;
        }

        for(const checkSpec of contextWithoutWsArgs._deferredChecks) {
          if (!checkSpec.processed) {
            // A "wait" check is completed in two ways:
            // - It exceeds its deadline -- checked at interval
            // - It matches successfully

            const [ err, results ] = await checkMatch(checkSpec.spec, data, contextWithoutWsArgs);
            if (!err) {
              emitMatches(results, ee);
              applyCaptures(results, ee);
              checkSpec.processed = true;
            } else {
              debug(err);
            }
          }
        }
      });

      ws.once('error', function (err) {
        debug(err);
        ee.emit('error', err.message || err.code);

        return cb(err, {});
      });
    }

    initialContext._successCount = 0;

    const steps = _.flatten([zero, one, tasks]);

    async.waterfall(
      steps,
      async function scenarioWaterfallCb(err, context) {
        if (err) {
          debug(err);
        }

        debug('waiting for outstanding checks');
        // TODO: Emit errors for checks that timed out
        while(true) {
          const outstandingWaits = context._deferredChecks.filter(c => !c.processed && !c.timedout);

          if (!err && (outstandingWaits.length > 0 || context._immediateCheck)) {
            await sleep(200);
          } else {            
            break;
          }
        }

        if (context && context.ws) {
          context.ws.close();
        }

        return callback(err, context);
      });
  };
};

function getWsConfig(config) {
  const tls = config.tls || {};
  const { proxy, ...options } = config.ws || {};

  if (proxy) {
    const { url: proxyUrl, ...proxyOptions } = proxy;

    debug('Set proxy: %s, options: %s', proxyUrl, proxyOptions);

    const agent = new HttpsProxyAgent({
      ...url.parse(proxyUrl),
      ...proxyOptions
    });

    options.agent = agent;
  }

  return _.extend(tls, options);
}
