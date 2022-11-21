'use strict';

var { test } = require('tap');
var runner = require('../..').runner.runner;
var l = require('lodash');
var request = require('got');
const { SSMS } = require('../../lib/ssms');

test('cookie jar http', function (t) {
  var script = require('./scripts/cookies.json');

  runner(script).then(function (ee) {
    ee.on('done', function (nr) {
      const report = SSMS.legacyReport(nr).report();
      request('http://127.0.0.1:3003/_stats', { responseType: 'json' })
        .then((res) => {
          var ok =
            report.scenariosCompleted &&
            l.size(res.body.cookies) === report.scenariosCompleted;
          t.ok(ok, 'Each scenario had a unique cookie');
          if (!ok) {
            console.log(res.body);
            console.log(report);
          }
          ee.stop().then(() => {
            t.end();
          });
        })
        .catch((err) => {
          t.fail(err);
        });
    });
    ee.run();
  });
});

test('cookie jar invalid response', function (t) {
  var script = require('./scripts/cookies_malformed_response.json');
  runner(script).then(function (ee) {
    ee.on('done', function (nr) {
      const report = SSMS.legacyReport(nr).report();
      t.ok(
        report.codes[200] && report.codes[200] > 0,
        'There should be some 200s'
      );
      t.ok(
        report.errors.cookie_parse_error_invalid_cookie &&
        report.errors.cookie_parse_error_invalid_cookie > 0,
        'There shoud be some cookie errors'
      );
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});

test('setting cookie jar parsing options', function (t) {
  var script = require('./scripts/cookies_malformed_response.json');
  Object.assign(script.config, { http: { cookieJarOptions: { looseMode: true } }});

  runner(script).then(function (ee) {
    ee.on('done', function (nr) {
      const report = SSMS.legacyReport(nr).report();
      t.ok(
        report.codes[200] && report.codes[200] > 0,
        'There should be some 200s'
      );

      t.ok(
        Object.keys(report.errors).length === 0,
        'There shoud be no errors'
      );
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});

test('cookie jar socketio', function (t) {
  var script = require('./scripts/cookies_socketio.json');
  runner(script).then(function (ee) {
    ee.on('done', function (nr) {
      const report = SSMS.legacyReport(nr).report();
      request('http://127.0.0.1:9092/_stats', { responseType: 'json' })
        .then((res) => {
          var ok =
            report.scenariosCompleted &&
            l.size(res.body.cookies) === report.scenariosCompleted;
          t.ok(ok, 'Each scenario had a unique cookie');
          if (!ok) {
            console.log(res.body);
            console.log(report);
          }
          ee.stop().then(() => {
            t.end();
          });
        })
        .catch((err) => {
          t.fail(err);
        });
    });
    ee.run();
  });
});

test('default cookies', function (t) {
  var script = require('./scripts/defaults_cookies.json');
  runner(script).then(function (ee) {
    ee.on('done', function (nr) {
      const report = SSMS.legacyReport(nr).report();
      t.ok(
        report.codes[200] && report.codes[200] > 0,
        'There should be some 200s'
      );
      t.ok(report.codes[403] === undefined, 'There should be no 403s');
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});

test('no default cookie', function (t) {
  var script = require('./scripts/defaults_cookies.json');
  delete script.config.defaults.cookie;
  runner(script).then(function (ee) {
    ee.on('done', function (nr) {
      const report = SSMS.legacyReport(nr).report();
      t.ok(
        report.codes[403] && report.codes[403] > 0,
        'There should be some 403s'
      );
      t.ok(report.codes[200] === undefined, 'There should be no 200s');
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});

test('no default cookie still sends cookies defined in script', function (t) {
  var script = require('./scripts/no_defaults_cookies.json');
  runner(script).then(function (ee) {
    ee.on('done', function (nr) {
      const report = SSMS.legacyReport(nr).report();
      t.ok(
        report.codes[200] && report.codes[200] > 0,
        'There should be some 200s'
      );
      t.ok(report.codes[403] === undefined, 'There should be no 403s');
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});
