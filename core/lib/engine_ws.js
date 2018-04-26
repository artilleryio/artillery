/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const async = require('async');
const _ = require('lodash');
const WebSocket = require('ws');
const debug = require('debug')('ws');
const engineUtil = require('./engine_util');
const template = engineUtil.template;

module.exports = WSEngine;

function WSEngine(script) {
  this.config = script.config;
}

WSEngine.prototype.createScenario = function(scenarioSpec, ee) {
  var self = this;
  let tasks = _.map(scenarioSpec.flow, function(rs) {
    if (rs.think) {
      return engineUtil.createThink(rs, _.get(self.config, 'defaults.think', {}));
    }
    return self.step(rs, ee);
  });

  return self.compile(tasks, scenarioSpec.flow, ee);
};

WSEngine.prototype.step = function (requestSpec, ee) {
  let self = this;

  if (requestSpec.loop) {
    let steps = _.map(requestSpec.loop, function(rs) {
      return self.step(rs, ee);
    });

    return engineUtil.createLoopWithCount(
      requestSpec.count || -1,
      steps,
      {
        loopValue: requestSpec.loopValue || '$loopCount',
        overValues: requestSpec.over
      });
  }

  if (requestSpec.think) {
    return engineUtil.createThink(requestSpec, _.get(self.config, 'defaults.think', {}));
  }

  let f = function(context, callback) {
    ee.emit('request');
    let startedAt = process.hrtime();

    if (requestSpec.function) {
      let processFunc = self.config.processor[requestSpec.function];
      if (processFunc) {
        processFunc(context, ee, function () {
          return callback(null, context);
        });
      }
    }

    let payload = template(requestSpec.send, context);
    if (typeof payload === 'object') {
      payload = JSON.stringify(payload);
    } else {
      payload = payload.toString();
    }

    debug('WS send: %s', payload);

    context.ws.send(payload, function(err) {
      if (err) {
        debug(err);
        ee.emit('error', err);
      } else {
        let endedAt = process.hrtime(startedAt);
        let delta = (endedAt[0] * 1e9) + endedAt[1];
        ee.emit('response', delta, 0, context._uid);
      }
      return callback(err, context);
    });
  };

  return f;
};

WSEngine.prototype.compile = function (tasks, scenarioSpec, ee) {
  let config = this.config;

  return function scenario(initialContext, callback) {
    function zero(callback) {
      let tls = config.tls || {}; // TODO: config.tls is deprecated
      let options = _.extend(tls, config.ws);

      ee.emit('started');

      let ws = new WebSocket(config.target, options);
      ws.on('open', function() {
        initialContext.ws = ws;
        return callback(null, initialContext);
      });
      ws.once('error', function(err) {
        debug(err);
        ee.emit('error', err.code);
        return callback(err, {});
      });
    }

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

        if (context && context.ws) {
          context.ws.close();
        }

        return callback(err, context);
      });
  };
};
