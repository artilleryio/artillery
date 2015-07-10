'use strict';

var EE = require('events').EventEmitter;
var async = require('async');
var _ = require('lodash');
var WebSocket = require('ws');
var debug = require('debug')('ws');
var workerUtil = require('./worker_util');

module.exports = {
  create: create
};

function create(scenarioSpec, scriptConfig, initialContext) {
  var ee = new EE();
  var ws = new WebSocket(scriptConfig.target);

  var zeroth = function(callback) {
      callback(null, initialContext);
    };

  var tasks = _.foldl(scenarioSpec, function(acc, rs) {
      acc.push(createStep(rs, scriptConfig, ee, ws));
      return acc;
    }, [zeroth]);

  ws.on('error', function onError(err) {
    debug(err);
    ee.emit('error', err.code);
  });

  ws.on('close', function onClose(code, message) {
    debug(code);
    debug(message);
  });

  var scenarioTask = function(callback) {
    ws.once('error', function(err) {
      return callback(err, {_pendingRequests: 0});
    });

    ws.on('open', function onOpen() {
      async.waterfall(tasks, function(err2, scenarioContext) {
        ws.close();
        return callback(err2, scenarioContext);
      });
    });
  };

  ee.launch = function(callback) {
      ee.emit('started');
      scenarioTask(callback);
    };

  return ee;
}

function createStep(requestSpec, scriptConfig, ee, ws) {
  if (requestSpec.think) {
    return workerUtil.createThink(requestSpec);
  }

  // FIXME: Presuming it's {"send": "payload"} here
  var f = function(context, callback) {
    ee.emit('request');
    var startedAt = process.hrtime();
    ws.send(requestSpec.send, function(err) {
      if (err) {
        debug(err);
        ee.emit('error', err.code);
      } else {
        var endedAt = process.hrtime(startedAt);
        var delta = (endedAt[0] * 1e9) + endedAt[1];
        ee.emit('response', delta);
      }
      return callback(err, context);
    });
  };

  return f;
}
