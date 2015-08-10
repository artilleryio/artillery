'use strict';

var async = require('async');
var _ = require('lodash');
var WebSocket = require('ws');
var debug = require('debug')('ws');
var workerUtil = require('./worker_util');

module.exports = {
  compile: compile
};

function compile(scenarioSpec, config, ee) {
  function zero(callback) {
    var ws = new WebSocket(config.target);
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

    var steps = _.flatten([
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
    return workerUtil.createThink(requestSpec);
  }

  var f = function(context, callback) {
    ee.emit('request');
    var startedAt = process.hrtime();
    context.ws.send(requestSpec.send, function(err) {
      if (err) {
        debug(err);
        ee.emit('error', err);
      } else {
        var endedAt = process.hrtime(startedAt);
        var delta = (endedAt[0] * 1e9) + endedAt[1];
        ee.emit('response', delta, 0);
      }
      return callback(err, context);
    });
  };

  return f;
}
