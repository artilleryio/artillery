'use strict';

const test = require('tape');
const vuserLauncher = require('../../../core/lib/runner').runner;

//
// If config.ws.rejectUnauthorized is not set, we will have an error.
// Otherwise the test will run fine.
//

test('TLS options for WebSocket', function(t) {
  const script = require('./scripts/extra_options.json');
  vuserLauncher(script).then(function(sessions) {
    sessions.on('done', function(report) {
      t.assert(Object.keys(report.errors).length === 0,
               'Test ran without errors');

      // Now remove TLS options and rerun - should have an error
      delete script.config.ws;
      vuserLauncher(script).then(function(sessions2) {
        sessions2.on('done', function(report2) {
          t.assert(Object.keys(report2.errors).length === 1,
                   'Test ran with one error: ' +
                   (Object.keys(report2.errors)[0]));
          t.end();
        });
        sessions2.run();
      });
    });
    sessions.run();
  });
});
