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
const engineUtil = require('@artilleryio/int-commons').engine_util;
const template = engineUtil.template;

module.exports = WSEngine;

function WSEngine(script) {
  this.config = script.config;
}

WSEngine.prototype.createScenario = function (scenarioSpec, ee) {
  const self = this;
  const tasks = _.map(scenarioSpec.flow, function (rs) {
    if (typeof rs.think !== 'undefined') {
      return engineUtil.createThink(
        rs,
        _.get(self.config, 'defaults.think', {})
      );
    }

    return self.step(rs, ee);
  });

  return self.compile(tasks, scenarioSpec.flow, ee);
};

function getMessageHandler(context, params, ee, timeout, callback) {
  let done = false;

  setTimeout(() => {
    if (!done) {
      const err = 'response timeout';
      ee.emit('error', err);
      return callback(err, context);
    }
  }, timeout * 1000);

  return function messageHandler(event) {
    ee.emit('counter', 'websocket.messages_received', 1);
    ee.emit('rate', 'websocket.receive_rate');
    done = true;
    const { data } = event;

    debug('WS receive: %s', data);

    if (!data) {
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
        if (err) {
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

        if (haveFailedMatches || haveFailedCaptures) {
          // TODO: Emit the details of each failed capture/match
          return callback(new Error('Failed capture or match'), context);
        }

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
        if (processFunc.constructor.name === 'Function') {
          processFunc(context, ee, function () {
            return callback(null, context);
          });
        } else {
          return processFunc(context, ee)
            .then(() => {
              callback(null, context);
            })
            .catch((err) => {
              callback(err, context);
            });
        }
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
    const params = requestSpec.wait || requestSpec.send;

    // match exists on a string, so check match is not a prototype
    let captureOrMatch = _.has(params, 'capture') || _.has(params, 'match');

    if (captureOrMatch) {
      // only process response if we're capturing
      let timeout =
        self.config.timeout || _.get(self.config, 'ws.timeout') || 10;
      context.ws.onmessage = getMessageHandler(
        context,
        params,
        ee,
        timeout,
        callback
      );
    } else {
      // Reset onmessage to stop steps interfering with each other
      context.ws.onmessage = undefined;
    }

    // Backwards compatible with previous version of `send` api
    let payload = captureOrMatch ? params.payload : params;

    if (payload !== undefined) {
      payload = template(payload, context);
      if (typeof payload === 'object') {
        payload = JSON.stringify(payload);
      } else {
        payload = _.toString(payload);
      }

      ee.emit('counter', 'websocket.messages_sent', 1);
      ee.emit('rate', 'websocket.send_rate');
      debug('WS send: %s', payload);

      context.ws.send(payload, function (err) {
        if (err) {
          debug(err);
          ee.emit('error', err);
          return callback(err, null);
        }

        // End step if we're not capturing
        if (!captureOrMatch) {
          return callback(null, context);
        }
      });
    } else if (captureOrMatch) {
      debug('WS wait: %j', params);
    } else {
      // in the end, we could not send anything, so report it and stop
      let err = 'invalid_step';
      debug(err, requestSpec);
      ee.emit('error', err);
      return callback(err, context);
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

        return cb(null, contextWithoutWsArgs);
      });

      ws.once('error', function (err) {
        debug(err);
        ee.emit('error', err.message || err.code);

        return cb(err, {});
      });
    }

    initialContext._successCount = 0;

    const steps = _.flatten([zero, one, tasks]);

    async.waterfall(steps, function scenarioWaterfallCb(err, context) {
      if (err) {
        ee.emit('error', err.code || err.message);
        debug(err);
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
