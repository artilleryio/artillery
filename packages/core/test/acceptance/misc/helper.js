const l = require('lodash');
const runner = require('../../..').runner.runner;
const { SSMS } = require('../../../lib/ssms');

const runGenericRunnerTest = (script, t) => {
  const startedAt = process.hrtime();
  let completedPhases = 0;

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
      const requests = report.requestsCompleted;
      const scenarios = report.scenariosCompleted;
      console.log('# requests = %s, scenarios = %s', requests, scenarios);

      t.equal(
        completedPhases,
        script.config.phases.length,
        'Should have completed all phases'
      );
      const completedAt = process.hrtime(startedAt);
      const delta = (completedAt[0] * 1e9 + completedAt[1]) / 1e6;
      const minDuration = l.reduce(
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
      t.equal(
        Object.keys(report.errors).length,
        0,
        'Should have no errors in report'
      );

      ee.stop().then(() => {
        t.end();
      });
    });

    ee.run();
  });
};

module.exports = {
  runGenericRunnerTest
};
