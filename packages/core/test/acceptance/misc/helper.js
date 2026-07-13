const assert = require('node:assert');
const l = require('lodash');
const runner = require('../../..').runner.runner;
const { SSMS } = require('../../../lib/ssms.ts');

const runGenericRunnerTest = (script) => {
  const startedAt = process.hrtime();
  let completedPhases = 0;

  return new Promise((resolve, reject) => {
    runner(script).then((ee) => {
      ee.on('phaseStarted', (x) => {
        assert.ok(x, 'phaseStarted event emitted');
      });
      ee.on('phaseCompleted', (x) => {
        completedPhases++;
        assert.ok(x, 'phaseCompleted event emitted');
      });
      ee.on('stats', (stats) => {
        assert.ok(stats, 'intermediate stats event emitted');
      });
      ee.on('done', (nr) => {
        try {
          const report = SSMS.legacyReport(nr).report();
          const requests = report.requestsCompleted;
          const scenarios = report.scenariosCompleted;
          console.log('# requests = %s, scenarios = %s', requests, scenarios);

          assert.strictEqual(
            completedPhases,
            script.config.phases.length,
            'Should have completed all phases'
          );
          const completedAt = process.hrtime(startedAt);
          const delta = (completedAt[0] * 1e9 + completedAt[1]) / 1e6;
          const minDuration = l.reduce(
            script.config.phases,
            (acc, phaseSpec) => acc + phaseSpec.duration * 1000,
            0
          );
          assert.ok(
            delta >= minDuration,
            'Should run for at least the total duration of phases'
          );

          assert.ok(requests > 0, 'Should have successful requests');
          assert.ok(scenarios > 0, 'Should have successful scenarios');

          if (report.errors) {
            console.log(`# errors: ${JSON.stringify(report.errors, null, 4)}`);
          }
          assert.strictEqual(
            Object.keys(report.errors).length,
            0,
            'Should have no errors in report'
          );
        } catch (err) {
          reject(err);
          return;
        }

        ee.stop().then(resolve);
      });

      ee.run();
    });
  });
};

module.exports = {
  runGenericRunnerTest
};
