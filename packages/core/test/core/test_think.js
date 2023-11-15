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
      t.ok(Object.keys(report.errors).length === 0, 'no errors');
      t.ok(Object.keys(report.codes).length === 0, 'stats should be empty');
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});

test('think - invalid think time', function (t) {
  const script = l.cloneDeep(require('./scripts/thinks_http.json'));
  delete script.scenarios[0].flow;
  script.scenarios[0].flow = [{ think: '1 potatoe' }];
  runner(script).then(function (ee) {
    ee.on('done', function (nr) {
      const report = SSMS.legacyReport(nr).report();
      console.log(report);
      t.ok(
        Object.keys(report.errors).includes('Invalid think time: 1 potatoe'),
        'should have an error in report'
      );
      t.ok(Object.keys(report.codes).length === 0, 'stats should be empty');
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
      t.ok(Object.keys(report.errors).length === 0, 'no errors');
      t.ok(Object.keys(report.codes).length === 0, 'stats should be empty');
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});
