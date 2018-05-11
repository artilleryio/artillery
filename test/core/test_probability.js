'use strict';

const test = require('tape');
const runner = require('../../core/lib/runner').runner;
const L = require('lodash');

test('request probability', (t) => {
  const script = require('./scripts/probability.json');

  runner(script).then(function(ee) {
    ee.on('done', (report) => {
      let requests = report.requestsCompleted;
      t.assert(requests < 130,
               'Should have completed ~10% = ~100 requests in total, actually completed ' + requests);
      t.end();
    });
    ee.run();
  });
});
