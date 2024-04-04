'use strict';

const { test, beforeEach, afterEach } = require('tap');
const runner = require('../../..').runner.runner;
const { SSMS } = require('../../../lib/ssms');
const createTestServer = require('../targets/simple');

let server;
let port;
beforeEach(async () => {
  server = await createTestServer(0);
  port = server.info.port;
});

afterEach(() => {
  server.stop();
});

test('arrival phases', function (t) {
  const script = require('../scripts/arrival_phases.json');
  script.config.target = `http://127.0.0.1:${port}`;

  runner(script).then(function (ee) {
    ee.on('phaseStarted', function (info) {
      console.log('Starting phase: %j - %s', info, new Date());
    });
    ee.on('phaseCompleted', function () {
      console.log('Phase completed - %s', new Date());
    });

    ee.on('done', function (nr) {
      const report = SSMS.legacyReport(nr).report();

      t.equal(report.codes[200], 60, 'Should get 60 status 200 responses');

      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});

test('arrival phases - with modified time format', function (t) {
  const script = require('../scripts/arrival_phases_time_format.json');
  script.config.target = `http://127.0.0.1:${port}`;

  const initialTime = Date.now();

  runner(script).then(function (ee) {
    ee.on('phaseStarted', function (info) {
      console.log('Starting phase: %j - %s', info, new Date());
    });
    ee.on('phaseCompleted', function () {
      console.log('Phase completed - %s', new Date());
    });

    ee.on('done', function (nr) {
      const finalTime = Date.now();
      const report = SSMS.legacyReport(nr).report();

      t.equal(report.codes[200], 61, 'Did not get 61 status 200 responses');
      t.ok(
        finalTime - initialTime >= 50 * 1000,
        `Took ${
          finalTime - initialTime
        }ms. Did not take at least 50 seconds (to account for pause time)`
      );

      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});
