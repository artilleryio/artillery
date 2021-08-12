'use strict';

const test = require('tape');
const runner = require('../../core').runner;
const L = require('lodash');
const { SSMS } = require('../../core/lib/ssms');

test('ifTrue', (t) => {
  const script = require('./scripts/iftrue.json');

  runner(script).then(function(ee) {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();
      let requests = report.codes[201];
      let expected = 10;
      t.assert(
        requests === expected,
        'Should have ' + expected + ' 201s (pet created)');
      t.assert(report.codes[404] === expected,
               'Should have ' + expected + '404s');
      t.assert(!report.codes[200],
               'Should not have 200s');
      ee.stop().then(() => {
        t.end();
      });

    });
    ee.run();
  });
});
