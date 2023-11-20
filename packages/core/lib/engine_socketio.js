/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const async = require('async');
const _ = require('lodash');

const io = require('socket.io-client');
const wildcardPatch = require('socketio-wildcard')(io.Manager);

const deepEqual = require('fast-deep-equal');
const debug = require('debug')('socketio');
const engineUtil = require('@artilleryio/int-commons').engine_util;
const EngineHttp = require('./engine_http');
const template = engineUtil.template;

module.exports = SocketIoEngine;

function SocketIoEngine(script) {
  this.config = script.config;

  this.socketioOpts = this.config.socketio || {};
  this.httpDelegate = new EngineHttp(script);
}

SocketIoEngine.prototype.createScenario = function (scenarioSpec, ee) {
  const self = this;
  // Adds scenario overridden configuration into the static config
  this.socketioOpts = { ...this.socketioOpts, ...scenarioSpec.socketio };

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

function markEndTime(ee, _, startedAt) {
  const endedAt = process.hrtime(startedAt);
  const delta = endedAt[0] * 1e9 + endedAt[1];

  ee.emit('histogram', 'socketio.response_time', delta / 1e6);
}

function isResponseRequired(spec) {
  return (
    spec.emit && spec.response && (spec.response.channel || spec.response.on)
  );
}

function isAcknowledgeRequired(spec) {
  return spec.emit && spec.acknowledge;
}

function isValid(data, response) {
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

function processResponse(ee, data, response, context, callback) {
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
  engineUtil.captureOrMatch(
    response,
    fauxResponse,
    context,
    function (err, result) {
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
          _.each(result.captures, function (v, k) {
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
    }
  );
}

SocketIoEngine.prototype.step = function (requestSpec, ee) {
  const self = this;

  if (requestSpec.loop) {
    const steps = _.map(requestSpec.loop, function (rs) {
      if (!rs.emit && !rs.loop) {
        return self.httpDelegate.step(rs, ee);
      }
      return self.step(rs, ee);
    });

    return engineUtil.createLoopWithCount(requestSpec.count || -1, steps, {
      loopValue: requestSpec.loopValue,
      loopElement: requestSpec.loopElement || '$loopElement',
      overValues: requestSpec.over,
      whileTrue: self.config.processor
        ? self.config.processor[requestSpec.whileTrue]
        : undefined
    });
  }

  const f = function (context, callback) {
    // Only process emit requests; delegate the rest to the HTTP engine (or think utility)
    if (requestSpec.think) {
      return engineUtil.createThink(
        requestSpec,
        _.get(self.config, 'defaults.think', {})
      );
    }
    if (!requestSpec.emit) {
      const delegateFunc = self.httpDelegate.step(requestSpec, ee);
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

    const endCallback = function (err, context, needEmit) {
      if (err) {
        debug(err);
      }

      if (isAcknowledgeRequired(requestSpec)) {
        const ackCallback = function (...args) {
          const response = {
            data: template(
              requestSpec.acknowledge.data || requestSpec.acknowledge.args,
              context
            ),
            capture: template(requestSpec.acknowledge.capture, context),
            match: template(requestSpec.acknowledge.match, context)
          };
          // Make sure data, capture or match has a default json spec for parsing socketio responses
          _.each(response, function (r) {
            if (_.isPlainObject(r) && !('json' in r)) {
              r.json = '$.0'; // Default to the first callback argument
            }
          });

          // Acknowledge data can take up multiple arguments of the emit callback
          processResponse(ee, args, response, context, function (err) {
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
      const response = {
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
      let responseData = [];

      socketio.on(response.channel, function receive(...args) {
        responseData.push(...args);
        if (isValid(responseData, response)) {
          done = true;

          processResponse(ee, responseData, response, context, function (err) {
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
      const waitTime = (self.config.timeout || 10) * 1000;

      setTimeout(function responseTimeout() {
        if (!done) {
          if (responseData.length) {
            processResponse(
              ee,
              responseData,
              response,
              context,
              function (err) {
                if (!err) {
                  markEndTime(ee, context, startedAt);
                }
                // Stop listening on the response channel
                socketio.off(response.channel);

                // called
                return endCallback(err, context, false);
              }
            );

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

  function preStep(context, callback) {
    // Set default namespace in emit action
    requestSpec.namespace = template(requestSpec.namespace, context) || '';

    self.loadContextSocket(requestSpec.namespace, context, function (err) {
      if (err) {
        debug(err);
        ee.emit('error', err.message);
        return callback(err, context);
      }

      return f(context, callback);
    });
  }

  if (requestSpec.emit) {
    return preStep;
  } else {
    return f;
  }
};

SocketIoEngine.prototype.loadContextSocket = function (namespace, context, cb) {
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

    socket.on('*', function () {
      context.__receivedMessageCount++;
    });

    socket.once('connect', function () {
      cb(null, socket);
    });
    socket.once('connect_error', function (err) {
      cb(err, null);
    });

    socket.once('error', function (err) {
      cb(err, socket);
    });
  } else {
    return cb(null, context.sockets[namespace]);
  }
};

SocketIoEngine.prototype.closeContextSockets = function (context) {
  if (context.sockets && Object.keys(context.sockets).length > 0) {
    const namespaces = Object.keys(context.sockets);

    namespaces.forEach(function (namespace) {
      context.sockets[namespace].disconnect();
    });
  }
};

SocketIoEngine.prototype.compile = function (tasks, scenarioSpec, ee) {
  const self = this;

  function zero(callback, context) {
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

  return function scenario(initialContext, callback) {
    initialContext = self.httpDelegate.setInitialContext(initialContext);

    initialContext._pendingRequests = _.size(
      _.reject(scenarioSpec, function (rs) {
        return typeof rs.think === 'number';
      })
    );

    const steps = _.flatten([
      function z(cb) {
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
};
