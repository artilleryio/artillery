'use strict';

var test = require('tape');
var runner = require('../lib/runner').runner;

test('reuse', function(t) {
  let script = require('./scripts/hello.json');
  let ee = runner(script);
  let first = true;
  let expected = 0;
  let weightedFlowLengths = 0;
  let lastLatency = null;
  for (let i = 0; i < script.config.phases.length; i++) {
    let arrivalRate = script.config.phases[0].arrivalRate;
    let duration = script.config.phases[0].duration;
    expected += arrivalRate * duration;
  }
  for (let i = 0; i < script.scenarios.length; i++) {
    let flowLength = script.scenarios[i].flow.length;
    if (script.scenarios[i].weight) {
      let scenarioWeight = script.scenarios[i].weight;
      weightedFlowLengths += scenarioWeight * flowLength;
    } else {
      weightedFlowLengths += flowLength;
    }
  }
  expected *= weightedFlowLengths;
  ee.on('done', function(stats) {
    let total = 0;
    for (let i = 0; i < stats.intermediate.length; i++) {
      total += stats.intermediate[i].latencies.length;
      t.assert(
          'intermediate should have the same or fewer results',
          stats.intermediate[i].latencies.length <= expected
      );
    }
    t.assert(
        'total of intermediates should have the same or fewer results',
        total <= expected
    );
    t.assert(
        'aggregate should have the expected number of latencies',
        stats.aggregate.latencies.length === expected
    );
    if (first) {
      let last = stats.aggregate.latencies.length - 1;
      first = false;
      lastLatency = stats.aggregate.latencies[last][0];
      ee.run();
    } else {
      t.assert(
          'first latency of second aggregate should be after ' +
          'the last latency of the first aggregate',
          lastLatency <= stats.aggregate.latencies[0][0]
      );
      t.end();
    }
  });
  ee.run();
});

test('concurrent runners', function(t) {
  let script = require('./scripts/hello.json');
  let ee1 = runner(script);
  let ee2 = runner(script);

  let done = 0;

  ee1.on('done', function(report) {
    console.log('HTTP 200 count:', report.aggregate.codes[200]);
    t.assert(report.aggregate.codes[200] <= 20,
             'Stats from the other runner don\'t get merged in');
    done++;
    if (done === 2) {
      t.end();
    }
  });

  ee2.on('done', function(report) {
    t.assert(report.aggregate.codes[200] <= 20,
             'Stats from the other runner don\'t get merged in');
    done++;
    if (done === 2) {
      t.end();
    }
  });

  ee1.run();
  ee2.run();
});
