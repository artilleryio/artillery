'use strict';

const test = require('tape');
const runner = require('../lib/runner').runner;
const L = require('lodash');

test('loop', (t) => {
  const script = require('./scripts/loop.json');

  let ee = runner(script);
  ee.on('done', (stats) => {
    let scenarios = stats.aggregate.scenariosCompleted;
    let requests = stats.aggregate.requestsCompleted;
    let loopCount = script.scenarios[0].flow[0].count;
    let expected = scenarios * loopCount;
    t.assert(
      requests === expected,
      'Should have ' + loopCount + ' requests for each completed scenario');
    t.end();
  });
  ee.run();
});
