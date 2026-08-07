/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import async from 'async';
import createDebug from 'debug';
import deepEqual from 'fast-deep-equal';
import _ from 'lodash';
import io from 'socket.io-client';
import sioWildcard from 'socketio-wildcard';
import { engine_util as engineUtil } from '../commons/index.ts';
import EngineHttp from './engine_http.ts';

const wildcardPatch = sioWildcard((io as any).Manager);

const debug = createDebug('socketio');
const template = engineUtil.template;

// NOTE on typing: request specs and VU context values are dynamic by
// design (user scripts + processor hooks), so they are typed as
// Record<string, any>/any until canonical script input types exist
// (modernization plan, phase 2).

type StepCallback = (err?: any, context?: any) => void;
type StepFunction = (context: any, callback: StepCallback) => any;

interface EventEmitterLike {
  emit(event: string, ...args: any[]): unknown;
}

function markEndTime(
  ee: EventEmitterLike,
  _context: unknown,
  startedAt: [number, number]
) {
  const endedAt = process.hrtime(startedAt);
  const delta = endedAt[0] * 1e9 + endedAt[1];

  ee.emit('histogram', 'socketio.response_time', delta / 1e6);
}

function isResponseRequired(spec: Record<string, any>): boolean {
  return Boolean(
    spec.emit && spec.response && (spec.response.channel || spec.response.on)
  );
}

function isAcknowledgeRequired(spec: Record<string, any>): boolean {
  return Boolean(spec.emit && spec.acknowledge);
}

function isValid(data: any[], response: Record<string, any>): boolean {
  if (_.isArray(response.data)) {
    //we check if it's an array first (as arrays are objects), and if it's an array, do a deep equality check between both arrays
    return deepEqual(data, response.data);
  }

  if (_.isObject(response.data)) {
    //`json` key is added at some point to the response.data object, to use with `captureOrMatch` function
    //we should omit it when comparing the response to the data
    const expectedResponse = _.omit(response.data, 'json');
    const actualResponse = data[data.length - 1]; // if response.data is not an array, we compare it to the last element of the actual response

    return deepEqual(actualResponse, expectedResponse);
  }

  if (_.isString(response.data)) {
    const expectedResponse = response.data;
    let actualResponse = data[data.length - 1]; // if response.data is not an array, we compare it to the last element of the actual response

    // unless the user wants to test against the entire response
    if (response.concat) {
      actualResponse = data.join('');
    }

    debug(
      `checking if string ${expectedResponse} is a partial match for string ${actualResponse}`
    );
    return actualResponse.includes(expectedResponse); //we accept a partial match if it's a string
  }

  debug(`unexpected data type for response.data: ${typeof response.data}`);
  return false;
}

function processResponse(
  ee: EventEmitterLike,
  data: any[],
  response: Record<string, any>,
  context: any,
  callback: StepCallback
) {
  // Do we have supplied data to validate?
  if (response.data && !isValid(data, response)) {
    debug('data is not valid:');
    debug(data);
    debug(response);

    const err = 'data is not valid';
    ee.emit('error', err);

    return callback(err, context);
  }

  // If no capture or match specified, then we consider it a success at this point...
  if (!response.capture && !response.match) {
    return callback(null, context);
  }

  // Construct the (HTTP) response...
  const fauxResponse = { body: JSON.stringify(data) };

  // Handle the capture or match clauses...
  engineUtil.captureOrMatch(response, fauxResponse, context, (err, result) => {
    // Were we unable to invoke captureOrMatch?
    if (err) {
      debug(data);
      ee.emit('error', err);

      return callback(err, context);
    }

    if (result !== null) {
      // Do we have any failed matches?
      const failedMatches = _.filter(result.matches, (v) => {
        return !v.success;
      });

      // How to handle failed matches?
      if (failedMatches.length > 0) {
        debug(failedMatches);
        // TODO: Should log the details of the match somewhere
        ee.emit('error', 'Failed match');
        return callback(new Error('Failed match'), context);
      } else {
        // Populate the context with captured values
        _.each(result.captures, (v, k) => {
          context.vars[k] = v.value;
        });
      }

      // Replace the base object context
      // Question: Should this be JSON object or String?
      context.vars.$ = fauxResponse.body;

      // Increment the success count...
      context._successCount++;

      return callback(null, context);
    }
  });
}

export default class SocketIoEngine {
  declare config: Record<string, any>;
  declare socketioOpts: Record<string, any>;
  declare httpDelegate: EngineHttp;
  // Set by the runner after loading:
  declare __name?: string;

  constructor(script: { config: Record<string, any> }) {
    this.config = script.config;

    this.socketioOpts = this.config.socketio || {};
    this.httpDelegate = new EngineHttp(script);
  }

  async init(): Promise<void> {
    await this.httpDelegate.init();
  }

  createScenario(scenarioSpec: Record<string, any>, ee: EventEmitterLike) {
    // Adds scenario overridden configuration into the static config
    this.socketioOpts = { ...this.socketioOpts, ...scenarioSpec.socketio };

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
      const steps = _.map(requestSpec.loop, (rs) => {
        if (!rs.emit && !rs.loop) {
          return this.httpDelegate.step(rs, ee);
        }
        return this.step(rs, ee);
      });

      return engineUtil.createLoopWithCount(requestSpec.count || -1, steps, {
        loopValue: requestSpec.loopValue,
        loopElement: requestSpec.loopElement || '$loopElement',
        overValues: requestSpec.over,
        whileTrue: this.config.processor
          ? this.config.processor[requestSpec.whileTrue]
          : undefined
      });
    }

    const f: StepFunction = (context, callback) => {
      // Only process emit requests; delegate the rest to the HTTP engine (or think utility)
      if (requestSpec.think) {
        return engineUtil.createThink(
          requestSpec,
          _.get(this.config, 'defaults.think', {})
        );
      }
      if (!requestSpec.emit) {
        const delegateFunc = this.httpDelegate.step(requestSpec, ee);
        return delegateFunc(context, callback);
      }

      ee.emit('counter', 'socketio.emit', 1);
      ee.emit('rate', 'socketio.emit_rate');

      const startedAt = process.hrtime();
      const socketio = context.sockets[requestSpec.namespace] || null;
      if (!(requestSpec.emit && socketio)) {
        debug('invalid arguments');
        ee.emit('error', 'invalid arguments');

        // TODO: Provide a more helpful message
        callback(new Error('socketio: invalid arguments'));
      }

      const outgoing = requestSpec.emit.channel
        ? [
            template(requestSpec.emit.channel, context),
            template(requestSpec.emit.data, context)
          ]
        : Array.from(requestSpec.emit).map((arg) => template(arg, context));

      const endCallback = (err: any, context: any, needEmit?: boolean) => {
        if (err) {
          debug(err);
        }

        if (isAcknowledgeRequired(requestSpec)) {
          const ackCallback = (...args: any[]) => {
            const response: Record<string, any> = {
              data: template(
                requestSpec.acknowledge.data || requestSpec.acknowledge.args,
                context
              ),
              capture: template(requestSpec.acknowledge.capture, context),
              match: template(requestSpec.acknowledge.match, context)
            };
            // Make sure data, capture or match has a default json spec for parsing socketio responses
            _.each(response, (r) => {
              if (_.isPlainObject(r) && !('json' in r)) {
                r.json = '$.0'; // Default to the first callback argument
              }
            });

            // Acknowledge data can take up multiple arguments of the emit callback
            processResponse(ee, args, response, context, (err) => {
              if (!err) {
                markEndTime(ee, context, startedAt);
              }
              return callback(err, context);
            });
          };

          // Acknowledge required so add callback to emit
          if (needEmit) {
            socketio.emit(...outgoing, ackCallback);
          } else {
            ackCallback();
          }
        } else {
          // No acknowledge data is expected, so emit without a listener
          if (needEmit) {
            socketio.emit(...outgoing);
          }
          markEndTime(ee, context, startedAt);
          return callback(err, context);
        }
      }; // endCallback

      if (isResponseRequired(requestSpec)) {
        const response: Record<string, any> = {
          channel: template(
            requestSpec.response.channel || requestSpec.response.on,
            context
          ),
          concat: template(requestSpec.response.concat, context),
          data: template(
            requestSpec.response.data || requestSpec.response.args,
            context
          ),
          capture: template(requestSpec.response.capture, context),
          match: template(requestSpec.response.match, context)
        };

        // Listen for the socket.io response on the specified channel
        let done = false;
        const responseData: any[] = [];

        socketio.on(response.channel, function receive(...args: any[]) {
          responseData.push(...args);
          if (isValid(responseData, response)) {
            done = true;

            processResponse(ee, responseData, response, context, (err) => {
              if (!err) {
                markEndTime(ee, context, startedAt);
              }
              // Stop listening on the response channel
              socketio.off(response.channel);

              return endCallback(err, context, false);
            });
          }
        });

        // Send the data on the specified socket.io channel
        socketio.emit(...outgoing);
        // If we don't get a response within the timeout, fire an error
        const waitTime = (this.config.timeout || 10) * 1000;

        setTimeout(function responseTimeout() {
          if (!done) {
            if (responseData.length) {
              processResponse(ee, responseData, response, context, (err) => {
                if (!err) {
                  markEndTime(ee, context, startedAt);
                }
                // Stop listening on the response channel
                socketio.off(response.channel);

                // called
                return endCallback(err, context, false);
              });

              return;
            }

            const err = 'response timeout';
            ee.emit('error', err);
            return callback(err, context);
          }
        }, waitTime);
      } else {
        endCallback(null, context, true);
      }
    };

    const preStep: StepFunction = (context, callback) => {
      // Set default namespace in emit action
      requestSpec.namespace = template(requestSpec.namespace, context) || '';

      this.loadContextSocket(requestSpec.namespace, context, (err) => {
        if (err) {
          debug(err);
          ee.emit('error', (err as Error).message);
          return callback(err, context);
        }

        return f(context, callback);
      });
    };

    if (requestSpec.emit) {
      return preStep;
    } else {
      return f;
    }
  }

  loadContextSocket(
    namespace: string,
    context: any,
    cb: (err: any, socket?: any) => void
  ) {
    context.sockets = context.sockets || {};

    if (!context.sockets[namespace]) {
      const target = this.config.target + namespace;
      const tls = this.config.tls || {};

      const socketioOpts = template(this.socketioOpts, context);
      const options = _.extend(
        {},
        socketioOpts, // templated
        tls
      );

      const socket = io(target, options);
      context.sockets[namespace] = socket;

      wildcardPatch(socket);

      socket.on('*', () => {
        context.__receivedMessageCount++;
      });

      socket.once('connect', () => {
        cb(null, socket);
      });
      socket.once('connect_error', (err) => {
        cb(err, null);
      });

      socket.once('error', (err) => {
        cb(err, socket);
      });
    } else {
      return cb(null, context.sockets[namespace]);
    }
  }

  closeContextSockets(context: any) {
    if (context.sockets && Object.keys(context.sockets).length > 0) {
      const namespaces = Object.keys(context.sockets);

      namespaces.forEach((namespace) => {
        context.sockets[namespace].disconnect();
      });
    }
  }

  compile(
    tasks: StepFunction[],
    scenarioSpec: Array<Record<string, any>>,
    ee: EventEmitterLike
  ) {
    const self = this;

    function zero(callback: StepCallback, context: any) {
      context.__receivedMessageCount = 0;
      ee.emit('started');

      self.loadContextSocket('', context, function done(err) {
        if (err) {
          ee.emit('error', err);

          return callback(err, context);
        }

        return callback(null, context);
      });
    }

    return function scenario(initialContext: any, callback: StepCallback) {
      initialContext = self.httpDelegate.setInitialContext(initialContext);

      initialContext._pendingRequests = _.size(
        _.reject(scenarioSpec, (rs) => typeof rs.think === 'number')
      );

      const steps = _.flatten([
        function z(cb: StepCallback) {
          return zero(cb, initialContext);
        },
        tasks
      ]);

      async.waterfall(steps, function scenarioWaterfallCb(err, context) {
        if (err) {
          debug(err);
        }

        if (context) {
          self.closeContextSockets(context);
        }

        return callback(err, context);
      });
    };
  }
}
