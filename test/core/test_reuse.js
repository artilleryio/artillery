'use strict';

var test = require('tape');
var runner = require('../../core/lib/runner').runner;

test('reuse', function(t) {
  let script = require('./scripts/hello.json');
  runner(script).then(function(ee) {
    let first = true;
    let expected = 0;
    let weightedFlowLengths = 0;
    let lastLatency = null;
    let intermediate = [];
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
    ee.on('beforeTestRequest', function(){
      t.assert('should preform before requests in the \'before requests\' test', script === 'before requests');
    });
    ee.on('stats', function(stats) {
      intermediate.push(stats.report());
    });
    ee.on('done', function(report) {
      let total = 0;
      for (let i = 0; i < intermediate.length; i++) {
        total += intermediate[i].latencies.length;
        t.assert(
          'intermediate should have the same or fewer results',
          intermediate[i].latencies.length <= expected
        );
      }
      t.assert(
        'total of intermediates should have the same or fewer results',
        total <= expected
      );
      t.assert(
        'aggregate should have the expected number of latencies',
        report.latencies.length === expected
      );
      if (first) {
        let lastIntermediate = intermediate.length - 1;
        let last = intermediate[lastIntermediate].latencies.length - 1;
        first = false;
        lastLatency = intermediate[lastIntermediate].latencies[last];
        ee.run();
      } else {
        t.assert(
          'first latency of second aggregate should be after ' +
            'the last latency of the first aggregate',
          lastLatency <= intermediate[0].latencies[0]
        );
        t.end();
      }
    });
    ee.run();
  });
});

test('concurrent runners', function(t) {
  let script = require('./scripts/hello.json');
  runner(script).then(function(ee1) {
    runner(script).then(function(ee2) {
      let done = 0;

      ee1.on('done', function(report) {
        console.log('HTTP 200 count:', report.codes[200]);
        t.assert(report.codes[200] <= 20,
                 'Stats from the other runner don\'t get merged in');
        done++;
        if (done === 2) {
          t.end();
        }
      });

      ee2.on('done', function(report) {
        t.assert(report.codes[200] <= 20,
                 'Stats from the other runner don\'t get merged in');
        done++;
        if (done === 2) {
          t.end();
        }
      });

      ee1.run();
      ee2.run();
    });
  });
});
