'use strict';

const { test } = require('tap');
const runner = require('../..').runner.runner;
const { SSMS } = require('../../lib/ssms');

test('arrival phases', function (t) {
  var script = require('./scripts/arrival_phases.json');

  runner(script).then(function (ee) {
    ee.on('phaseStarted', function (info) {
      console.log('Starting phase: %j - %s', info, new Date());
    });
    ee.on('phaseCompleted', function () {
      console.log('Phase completed - %s', new Date());
    });

    ee.on('done', function (nr) {
      const report = SSMS.legacyReport(nr).report();

      t.ok(report.codes[200] === 60, 'Got 60 status 200 responses');

      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});
