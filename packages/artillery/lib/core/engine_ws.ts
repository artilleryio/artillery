/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import url from 'node:url';
import async from 'async';
import createDebug from 'debug';
import HttpsProxyAgent from 'https-proxy-agent';
import _ from 'lodash';
import WebSocket from 'ws';
import { engine_util as engineUtil } from '../commons/index.ts';

const debug = createDebug('ws');
const template = engineUtil.template;

// NOTE on typing: request specs, WS args and VU context values are
// dynamic by design (user scripts + processor hooks), so they are
// typed as Record<string, any>/any until canonical script input types
// exist (modernization plan, phase 2).

type StepCallback = (err: any, context?: any) => void;
type StepFunction = (context: any, callback: StepCallback) => void;

interface EventEmitterLike {
  emit(event: string, ...args: any[]): unknown;
}

// Injectable dependencies - module namespaces are frozen, so tests
// replace the WebSocket implementation through this mutable object
export const _deps = { WebSocket };

function getMessageHandler(
  context: any,
  params: Record<string, any>,
  ee: EventEmitterLike,
  timeout: number,
  callback: StepCallback
) {
  let done = false;

  setTimeout(() => {
    if (!done) {
      const err = 'response timeout';
      ee.emit('error', err);
      return callback(err, context);
    }
  }, timeout * 1000);

  return function messageHandler(event: { data?: any }) {
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
    } catch (_err) {
      fauxResponse = { body: event.data };
    }

    engineUtil.captureOrMatch(
      params,
      fauxResponse,
      context,
      function captured(err, result) {
        if (err) {
          ee.emit('error', err.message || (err as NodeJS.ErrnoException).code);
          return callback(err, context);
        }

        // result is non-null here: this handler is only wired up when
        // the step has capture/match specs.
        const res = result as NonNullable<typeof result>;
        const { captures = {}, matches = {} } = res;

        debug('matches: ', matches);
        debug('captures: ', captures);

        // match and capture are strict by default:
        const haveFailedMatches = _.some(
          res.matches,
          (v) => !v.success && v.strict !== false
        );

        const haveFailedCaptures = _.some(res.captures, (v) =>
          Boolean(v.failed)
        );

        if (haveFailedMatches || haveFailedCaptures) {
          // TODO: Emit the details of each failed capture/match
          return callback(new Error('Failed capture or match'), context);
        }

        _.each(res.matches, (v) => {
          ee.emit('match', v.success, {
            expected: v.expected,
            got: v.got,
            expression: v.expression,
            strict: v.strict
          });
        });

        _.each(res.captures, (v, k) => {
          _.set(context.vars, k, v.value);
        });

        return callback(null, context);
      }
    );
  };
}

export default class WSEngine {
  declare config: Record<string, any>;
  // Set by the runner after loading:
  declare __name?: string;

  constructor(script: { config: Record<string, any> }) {
    this.config = script.config;
  }

  createScenario(scenarioSpec: Record<string, any>, ee: EventEmitterLike) {
    const tasks = _.map(scenarioSpec.flow, (rs) => {
      if (typeof rs.think !== 'undefined') {
        return engineUtil.createThink(
          rs,
          _.get(this.config, 'defaults.think', {})
        );
      }

      return this.step(rs, ee);
    });

    return this.compile(tasks, scenarioSpec.flow, ee);
  }

  step(requestSpec: Record<string, any>, ee: EventEmitterLike): StepFunction {
    if (requestSpec.loop) {
      const steps = _.map(requestSpec.loop, (rs) => this.step(rs, ee));

      return engineUtil.createLoopWithCount(requestSpec.count || -1, steps, {
        loopValue: requestSpec.loopValue || '$loopCount',
        overValues: requestSpec.over,
        whileTrue: this.config.processor
          ? this.config.processor[requestSpec.whileTrue]
          : undefined
      });
    }

    if (requestSpec.think) {
      return engineUtil.createThink(
        requestSpec,
        _.get(this.config, 'defaults.think', {})
      );
    }

    if (requestSpec.function) {
      return (context, callback) => {
        const processFunc = this.config.processor[requestSpec.function];
        if (processFunc) {
          if (processFunc.constructor.name === 'Function') {
            processFunc(context, ee, () => callback(null, context));
          } else {
            return processFunc(context, ee)
              .then(() => {
                callback(null, context);
              })
              .catch((err: unknown) => {
                callback(err, context);
              });
          }
        }
      };
    }

    if (requestSpec.log) {
      return (context, callback) => {
        console.log(template(requestSpec.log, context));
        return process.nextTick(() => {
          callback(null, context);
        });
      };
    }

    if (requestSpec.connect) {
      return (context, callback) =>
        process.nextTick(() => {
          callback(null, context);
        });
    }

    const f: StepFunction = (context, callback) => {
      const params = requestSpec.wait || requestSpec.send;

      // match exists on a string, so check match is not a prototype
      const captureOrMatch = _.has(params, 'capture') || _.has(params, 'match');

      if (captureOrMatch) {
        // only process response if we're capturing
        const timeout =
          this.config.timeout || _.get(this.config, 'ws.timeout') || 10;
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

        context.ws.send(payload, (err: Error | undefined) => {
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
        const err = 'invalid_step';
        debug(err, requestSpec);
        ee.emit('error', err);
        return callback(err, context);
      }
    };

    return f;
  }

  compile(
    tasks: StepFunction[],
    scenarioSpec: Array<Record<string, any>>,
    ee: EventEmitterLike
  ) {
    const config = this.config;

    return function scenario(initialContext: any, callback: StepCallback) {
      function zero(cb: (err: any, context?: any) => void) {
        ee.emit('started');

        getWsInstance(config, scenarioSpec, initialContext, cb);
      }

      function one(context: any, cb: (err: any, context?: any) => void) {
        const { wsArgs, ...contextWithoutWsArgs } = context;
        const ws = new _deps.WebSocket(
          wsArgs.target,
          wsArgs.subprotocols,
          wsArgs.options
        );

        ws.on('open', () => {
          contextWithoutWsArgs.ws = ws;

          return cb(null, contextWithoutWsArgs);
        });

        ws.once('error', (err) => {
          debug(err);
          ee.emit('error', err.message || (err as NodeJS.ErrnoException).code);

          return cb(err, {});
        });
      }

      initialContext._successCount = 0;

      const steps = _.flatten([zero, one, tasks]);

      async.waterfall(steps, function scenarioWaterfallCb(err, context) {
        if (err) {
          ee.emit('error', (err as NodeJS.ErrnoException).code || err.message);
          debug(err);
        }

        if (context?.ws) {
          context.ws.close();
        }

        return callback(err, context);
      });
    };
  }
}

function getWsOptions(config: Record<string, any>) {
  const options = getWsConfig(config);
  const subprotocols = _.get(config, 'ws.subprotocols', []);
  const headers = _.get(config, 'ws.headers', {});

  const subprotocolHeader = _.find(headers, (_value, headerName) => {
    return headerName.toLowerCase() === 'sec-websocket-protocol';
  });

  if (typeof subprotocolHeader !== 'undefined') {
    // NOTE: subprotocols defined via config.ws.subprotocols take precedence:
    subprotocols.push(
      ...(subprotocolHeader as string).split(',').map((s) => s.trim())
    );
  }

  return { options, subprotocols };
}

function getWsInstance(
  config: Record<string, any>,
  scenarioSpec: Array<Record<string, any>>,
  context: any,
  cb: (err: any, context: any) => void
) {
  let wsArgs: Record<string, any> = {
    ...getWsOptions(config),
    target: config.target
  };
  const [{ connect }] = scenarioSpec;

  if (connect) {
    if (connect.function && config.processor[connect.function]) {
      const processFn = config.processor[connect.function];

      return processFn(wsArgs, context, (err: unknown) => {
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

function getWsConfig(config: Record<string, any>) {
  const tls = config.tls || {};
  const { proxy, ...options } = config.ws || {};

  if (proxy) {
    const { url: proxyUrl, ...proxyOptions } = proxy;

    debug('Set proxy: %s, options: %s', proxyUrl, proxyOptions);

    const agent = new (HttpsProxyAgent as any)({
      ...url.parse(proxyUrl),
      ...proxyOptions
    });

    options.agent = agent;
  }

  return _.extend(tls, options);
}
