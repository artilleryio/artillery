'use strict';

var EE = require('events').EventEmitter;
var async = require('async');
var _ = require('lodash');
var WebSocket = require('ws');
var debug = require('debug')('ws');

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
    ee.emit('error', err);
  });

  ws.on('close', function onClose(code, message) {
    debug(code);
    debug(message);
  });

  var scenarioTask = function(callback) {
    ws.on('open', function onOpen() {
      async.waterfall(tasks, function(err, scenarioContext) {

        ee.emit('scenarioCompleted');
        if (err) {
          debug(err);
        }
        ws.close();
        return callback(null, scenarioContext);
      });
    });
  };

  ee.launch = function(callback) {
      ee.emit('scenarioStarted');
      scenarioTask(callback);
    };

  return ee;
}

function createStep(requestSpec, scriptConfig, ee, ws) {
  if (typeof requestSpec.think === 'number') {
    return function(context, callback) {
      debug('thinking for ' + requestSpec.think + ' seconds');
      setTimeout(function() {
        callback(null, context);
      }, requestSpec.think * 1000);
    };
  }

  // FIXME: Presuming it's {"send": "payload"} here
  var f = function(context, callback) {
    ee.emit('request');
    var startedAt = process.hrtime();
    ws.send(requestSpec.send, function(err) {
      if (err) {
        debug(err);
        ee.emit('error', err);
      } else {
        var endedAt = process.hrtime(startedAt);
        var delta = (endedAt[0] * 1e9) + endedAt[1];
        ee.emit('response', delta / 1e6);
      }
      return callback(err, context);
    });
  };

  return f;
}
