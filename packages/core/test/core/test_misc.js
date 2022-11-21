'use strict';

const { test } = require('tap');
const runner = require('../..').runner.runner;
const l = require('lodash');
const { SSMS } = require('../../lib/ssms');

var SCRIPTS = [
  'hello.json',
  'hello_ws.json',
  'hello_socketio.json',
  'express_socketio.json',
  'multiple_phases.json',
  'large_payload.json',
  'ws_proxy.json'
];

l.each(SCRIPTS, function (fn) {
  var script = require('./scripts/' + fn);
  test('# running script: ' + fn, function (t) {
    // Set up for expectations
    var completedPhases = 0;
    var startedAt = process.hrtime();

    runner(script).then(function (ee) {
      ee.on('phaseStarted', function (x) {
        t.ok(x, 'phaseStarted event emitted');
      });
      ee.on('phaseCompleted', function (x) {
        completedPhases++;
        t.ok(x, 'phaseCompleted event emitted');
      });
      ee.on('stats', function (stats) {
        t.ok(stats, 'intermediate stats event emitted');
      });
      ee.on('done', function (nr) {
        const report = SSMS.legacyReport(nr).report();
        var requests = report.requestsCompleted;
        var scenarios = report.scenariosCompleted;
        console.log('# requests = %s, scenarios = %s', requests, scenarios);

        t.ok(
          completedPhases === script.config.phases.length,
          "Should've completed all phases"
        );
        var completedAt = process.hrtime(startedAt);
        var delta = (completedAt[0] * 1e9 + completedAt[1]) / 1e6;
        var minDuration = l.reduce(
          script.config.phases,
          function (acc, phaseSpec) {
            return acc + phaseSpec.duration * 1000;
          },
          0
        );
        t.ok(
          delta >= minDuration,
          'Should run for at least the total duration of phases'
        );

        t.ok(requests > 0, 'Should have successful requests');
        t.ok(scenarios > 0, 'Should have successful scenarios');

        if (report.errors) {
          console.log(`# errors: ${JSON.stringify(report.errors, null, 4)}`);
        }
        t.ok(Object.keys(report.errors).length === 0, 'Should have no errors');

        ee.stop().then(() => {
          t.end();
        });
      });

      ee.run();
    });
  });
});
