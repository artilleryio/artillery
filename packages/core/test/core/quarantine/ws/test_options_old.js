'use strict';

const { test } = require('tap');
const core = require('../../..');
const vuserLauncher = core.runner.runner;
const { SSMS } = require('../../../lib/ssms');

//
// If config.ws.rejectUnauthorized is not set, we will have an error.
// Otherwise the test will run fine.
//

test('TLS options for WebSocket', function (t) {
  const script = require('./scripts/extra_options.json');
  vuserLauncher(script).then(function (sessions) {
    sessions.on('done', function (nr) {
      const report = SSMS.legacyReport(nr).report();
      t.ok(Object.keys(report.errors).length === 0, 'Test ran without errors');

      // Now remove TLS options and rerun - should have an error
      delete script.config.ws;
      vuserLauncher(script).then(function (sessions2) {
        sessions2.on('done', function (nr2) {
          const report2 = SSMS.legacyReport(nr2).report();
          t.equal(
            Object.keys(report2.errors).length,
            1,
            `Test should run with one error. Got: ${Object.keys(
              report2.errors
            )}`
          );

          sessions.stop().then(() => {
            sessions2.stop().then(() => {
              t.end();
            });
          });
        });
        sessions2.run();
      });
    });
    sessions.run();
  });
});
