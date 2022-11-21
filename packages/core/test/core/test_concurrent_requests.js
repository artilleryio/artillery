'use strict';

const { test } = require('tap');
const runner = require('../../lib/runner').runner;
const { SSMS } = require('../../lib/ssms');

test('scenarios avoided - arrival rate', function (t) {
  var script = require('./scripts/concurrent_requests_arrival_rate.json');
  runner(script).then(function (ee) {
    ee.on('phaseStarted', function (info) {
      console.log('Starting phase: %j - %s', info, new Date());
    });
    ee.on('phaseCompleted', function () {
      console.log('Phase completed - %s', new Date());
    });

    ee.on('done', function (nr) {
      const stats = SSMS.legacyReport(nr).report();

      t.ok(stats.codes['200'] === 1, 'Expected number of requests made');
      t.ok(stats.scenariosAvoided === 999, 'Expected number of VUs skipped');
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});

test('scenarios avoided - arrival count', function (t) {
  var script = require('./scripts/concurrent_requests_arrival_count.json');
  runner(script).then(function (ee) {
    ee.on('phaseStarted', function (info) {
      console.log('Starting phase: %j - %s', info, new Date());
    });
    ee.on('phaseCompleted', function () {
      console.log('Phase completed - %s', new Date());
    });

    ee.on('done', function (nr) {
      const stats = SSMS.legacyReport(nr).report();
      t.ok(stats.codes['200'] === 1, 'Expected number of requests made');
      t.ok(stats.scenariosAvoided === 999, 'Expected number of VUs skipped');
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});

test('scenarios avoided - ramp to', function (t) {
  var script = require('./scripts/concurrent_requests_ramp_to.json');
  runner(script).then(function (ee) {
    ee.on('phaseStarted', function (info) {
      console.log('Starting phase: %j - %s', info, new Date());
    });
    ee.on('phaseCompleted', function () {
      console.log('Phase completed - %s', new Date());
    });

    ee.on('done', function (nr) {
      const stats = SSMS.legacyReport(nr).report();
      t.ok(stats.codes['200'] > 0, 'should receive some 200s');
      t.ok(stats.scenariosAvoided > 0, 'should avoid some scenarios');
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});

test('scenarios avoided - multiple phases', function (t) {
  var script = require('./scripts/concurrent_requests_multiple_phases.json');
  runner(script).then(function (ee) {
    ee.on('phaseStarted', function (info) {
      console.log('Starting phase: %j - %s', info, new Date());
    });
    ee.on('phaseCompleted', function () {
      console.log('Phase completed - %s', new Date());
    });

    ee.on('done', function (nr) {
      const stats = SSMS.legacyReport(nr).report();
      t.ok(stats.codes['200'] > 0, 'should receive some 200s');
      t.ok(stats.scenariosAvoided > 0, 'should avoid some scenarios');
      t.ok(stats.scenariosAvoided < 1000, 'should avoid less than 1000');
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});
