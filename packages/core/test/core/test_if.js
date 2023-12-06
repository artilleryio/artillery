'use strict';

const { test } = require('tap');
const runner = require('../..').runner.runner;
const L = require('lodash');
const { SSMS } = require('../../lib/ssms');

test('ifTrue', (t) => {
  const script = require('./scripts/iftrue.json');

  runner(script).then(function (ee) {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();
      let requests = report.codes[201];
      let expected = 10;
      t.equal(
        requests,
        expected,
        'Should have ' + expected + ' 201s (pet created)'
      );
      t.equal(report.codes[404], expected, 'Should have ' + expected + '404s');
      t.notOk(report.codes[200], 'Should not have 200s');

      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});
