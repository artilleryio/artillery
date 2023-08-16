'use strict';

const { test } = require('tap');
const runner = require('../..').runner.runner;
const { SSMS } = require('../../lib/ssms');
const l = require('lodash');

test('think', function (t) {
  var script = require('./scripts/thinks_http.json');
  runner(script).then(function (ee) {
    ee.on('done', function (nr) {
      const report = SSMS.legacyReport(nr).report();
      t.ok('stats should be empty', report.codes === {});
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});

test('think - with defaults from config.http.defaults instead', function (t) {
  const script = l.cloneDeep(require('./scripts/thinks_http.json'));
  const think = script.config.defaults.think;
  delete script.config.defaults;
  script.config.http = { defaults: { think } };

  runner(script).then(function (ee) {
    ee.on('done', function (nr) {
      const report = SSMS.legacyReport(nr).report();

      t.ok('stats should be empty', report.codes === {});
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});
