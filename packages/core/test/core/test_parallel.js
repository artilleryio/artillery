'use strict';

const { test } = require('tap');
const runner = require('../..').runner.runner;
const L = require('lodash');

test('parallel requests', (t) => {
  const script = require('./scripts/parallel.json');

  runner(script).then(function (ee) {
    ee.on('done', (report) => {
      let scenarios = report.counters['vusers.completed'];
      let requests = report.counters['http.responses'];
      let stepCount = script.scenarios[0].flow[0].parallel.length;
      let expected = scenarios * stepCount;

      t.equal(
        requests,
        expected,
        'Should have ' + stepCount + ' requests for each completed scenario.'
      );
      t.notEqual(
        scenarios,
        0,
        'Should have at least 1 scenario successfully run'
      );

      ee.stop().then(() => {
        t.end();
      });
    });

    ee.run();
  });
});
