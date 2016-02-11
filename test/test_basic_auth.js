'use strict';

const test = require('tape');
const runner = require('../lib/runner').runner;

test('HTTP basic auth', (t) => {
  const script = require('./scripts/hello_basic_auth.json');

  let ee = runner(script);
  ee.on('done', (stats) => {
    let requests = stats.aggregate.requestsCompleted;
    let code200 = stats.aggregate.codes[200];
    let code401 = stats.aggregate.codes[401];
    t.assert(
      requests > 0 && (code200 === code401),
      'Should have an equal non-zero number of 200s and 401s');
    t.end();
  });
  ee.run();
});
