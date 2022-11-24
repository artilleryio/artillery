'use strict';

const { test } = require('tap');
const runner = require('../..').runner.runner;
const L = require('lodash');
const { SSMS } = require('../../lib/ssms');

test('request probability', (t) => {
  const script = require('./scripts/probability.json');

  runner(script).then(function (ee) {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();
      let requests = report.requestsCompleted;
      t.ok(
        requests < 130,
        'Should have completed ~10% = ~100 requests in total, actually completed ' +
          requests
      );
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});
