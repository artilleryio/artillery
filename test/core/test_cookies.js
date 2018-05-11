'use strict';

var test = require('tape');
var runner = require('../../core/lib/runner').runner;
var l = require('lodash');
var request = require('request');

test('cookie jar http', function(t) {
  var script = require('./scripts/cookies.json');
  runner(script).then(function(ee) {
    ee.on('done', function(report) {
      request(
        {
          method: 'GET',
          url: 'http://127.0.0.1:3003/_stats',
          json: true
        },
        function(err, res, body) {
          if (err) {
            return t.fail();
          }

          var ok = report.scenariosCompleted && l.size(body.cookies) === report.scenariosCompleted;
          t.assert(ok, 'Each scenario had a unique cookie');
          if (!ok) {
            console.log(body);
            console.log(report);
          }
          t.end();
        });
    });
    ee.run();
  });
});

test('cookie jar socketio', function(t) {
  var script = require('./scripts/cookies_socketio.json');
  runner(script).then(function(ee) {
    ee.on('done', function(report) {
      request(
        {
          method: 'GET',
          url: 'http://127.0.0.1:9092/_stats',
          json: true
        },
        function(err, res, body) {
          if (err) {
            return t.fail();
          }

          var ok = report.scenariosCompleted && l.size(body.cookies) === report.scenariosCompleted;
          t.assert(ok, 'Each scenario had a unique cookie');
          if (!ok) {
            console.log(body);
            console.log(report);
          }
          t.end();
        });
    });
    ee.run();
  });
});

test('default cookies', function(t) {
  var script = require('./scripts/defaults_cookies.json');
  runner(script).then(function(ee) {
    ee.on('done', function(report) {
      t.assert(report.codes[200] && report.codes[200] > 0,
               'There should be some 200s');
      t.assert(report.codes[403] === undefined,
               'There should be no 403s');
      t.end();
    });
    ee.run();
  });
});

test('no default cookie', function(t) {
  var script = require('./scripts/defaults_cookies.json');
  delete script.config.defaults.cookie;
  runner(script).then(function(ee) {
    ee.on('done', function(report) {
      t.assert(report.codes[403] && report.codes[403] > 0,
               'There should be some 403s');
      t.assert(report.codes[200] === undefined,
               'There should be no 200s');
      t.end();
    });
    ee.run();
  });
});
