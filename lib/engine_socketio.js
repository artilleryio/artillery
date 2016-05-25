/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const async = require('async');
const _ = require('lodash');
const io = require('socket.io-client');
const debug = require('debug')('socketio');
const engineUtil = require('./engine_util');
module.exports = SocketIoEngine;

function SocketIoEngine(config) {
  this.config = config;
}

function markEndTime(ee, context, startedAt) {
  let endedAt = process.hrtime(startedAt);
  let delta = (endedAt[0] * 1e9) + endedAt[1];
  ee.emit('response', delta, 0, context._uid);
}
function isResponseRequired(spec) {
  return (spec.emit && spec.emit.response && spec.emit.response.channel);
}

function processResponse(ee, data, expectedData) {
  let err = null;

  if (!data || (expectedData && (data !== expectedData))) {
    debug(data);
    err = 'data is not valid';
    ee.emit('error', err);
  }

  return err;
}

SocketIoEngine.prototype.step = function (requestSpec, ee) {
  let self = this;

  if (requestSpec.loop) {
    let steps = _.map(requestSpec.loop, function(rs) {
      return self.step(rs, ee);
    });

    return engineUtil.createLoopWithCount(requestSpec.count || -1, steps);
  }

  let f = function(context, callback) {
    ee.emit('request');
    let startedAt = process.hrtime();

    if (!(requestSpec.emit && requestSpec.emit.channel)) {
      ee.emit('error', 'invalid arguments');
    }

    if (isResponseRequired(requestSpec)) {
      // Listen for the socket.io response on the specified channel
      let responseChannel = requestSpec.emit.response.channel;
      context.socketio.on(responseChannel, function receive(data) {
        let err = processResponse(ee, data, requestSpec.emit.response.data);
        if (!err) {
          markEndTime(ee, context, startedAt);
        }
        // Stop listening on the response channel
        context.socketio.off(responseChannel);
        return callback(err, context);
      });
      // Send the data on the specified socket.io channel
      context.socketio.emit(requestSpec.emit.channel, requestSpec.emit.data);
    } else {
      // No return data is expected, so emit without a listener
      context.socketio.emit(requestSpec.emit.channel, requestSpec.emit.data);
      markEndTime(ee, context, startedAt);
      return callback(null, context);
    }
  };

  return f;
};

SocketIoEngine.prototype.compile = function (tasks, scenarioSpec, ee) {
  let config = this.config;

  function zero(callback) {
    let socketio = io.connect(config.target);
    socketio.on('connect', function() {
      ee.emit('started');
      return callback(null, {socketio: socketio});
    });
    socketio.once('error', function(err) {
      debug(err);
      ee.emit('error', err.code);
      return callback(err, {});
    });
  }

  return function scenario(initialContext, callback) {
    initialContext._successCount = 0;
    initialContext._pendingRequests = _.size(
      _.reject(scenarioSpec, function(rs) {
        return (typeof rs.think === 'number');
      }));

    let steps = _.flatten([
      zero,
      tasks
    ]);

    async.waterfall(
      steps,
      function scenarioWaterfallCb(err, context) {
        if (err) {
          debug(err);
        }
        if (context.socketio) {
          context.socketio.disconnect();
        }
        return callback(err, context);
      });
  };
};
