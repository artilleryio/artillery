'use strict';

const { test, beforeEach, afterEach } = require('tap');
const runner = require('../..').runner.runner;
const { SSMS } = require('../../lib/ssms');
const createTestServer = require('./targets/simple');

let server;
let port;
beforeEach(async () => {
  server = await createTestServer(0);
  port = server.info.port;
});

afterEach(() => {
  server.stop();
});

test('ifTrue', (t) => {
  const script = require('./scripts/iftrue.json');
  script.config.target = `http://127.0.0.1:${port}`;

  runner(script).then(function (ee) {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();
      let requests = report.codes[201];
      let expected = 10;
      t.equal(
        requests,
        expected,
        'Should have ' + expected + ' 201s (pet created)'
      );
      t.equal(report.codes[404], expected, 'Should have ' + expected + '404s');
      t.notOk(report.codes[200], 'Should not have 200s');

      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});
