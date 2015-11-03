'use strict';

const async = require('async');
const _ = require('lodash');
const WebSocket = require('ws');
const debug = require('debug')('ws');
const engineUtil = require('./engine_util');

module.exports = {
  compile: compile
};

function compile(scenarioSpec, config, ee) {
  function zero(callback) {
    let ws = new WebSocket(config.target);
    ws.on('open', function() {
      ee.emit('started');
      return callback(null, {ws: ws});
    });
    ws.once('error', function(err) {
      debug(err);
      ee.emit('error', err.code);
      return callback(err, {});
    });
  }

  var tasks = _.map(scenarioSpec, function(rs) {
    return createStep(rs, config, ee);
  });

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
        if (context.ws) {
          context.ws.close();
        }
        return callback(err, context);
      });
  };
}

function createStep(requestSpec, config, ee) {
  if (requestSpec.think) {
    return engineUtil.createThink(requestSpec);
  }

  let f = function(context, callback) {
    ee.emit('request');
    let startedAt = process.hrtime();
    context.ws.send(requestSpec.send, function(err) {
      if (err) {
        debug(err);
        ee.emit('error', err);
      } else {
        let endedAt = process.hrtime(startedAt);
        let delta = (endedAt[0] * 1e9) + endedAt[1];
        ee.emit('response', delta, 0);
      }
      return callback(err, context);
    });
  };

  return f;
}
