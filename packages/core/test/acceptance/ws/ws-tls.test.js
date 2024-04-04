'use strict';

const { test, beforeEach, afterEach } = require('tap');
const core = require('../../..');
const vuserLauncher = core.runner.runner;
const { SSMS } = require('../../../lib/ssms');
const createTestServer = require('../../targets/ws_tls');

let server;
let port;
beforeEach(async () => {
  const serverInfo = await createTestServer();
  port = serverInfo.port;
  server = serverInfo.server;
});

afterEach(() => {
  server.close();
});

test('TLS - with rejectUnauthorized false', function (t) {
  const script = require('./scripts/ws-tls.json');
  script.config.target = `wss://127.0.0.1:${port}`;
  vuserLauncher(script).then(function (ee) {
    ee.on('done', function (nr) {
      const report = SSMS.legacyReport(nr).report();
      console.log(report);
      t.ok(Object.keys(report.errors).length === 0, 'Test ran without errors');
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});

test('TLS - with rejectUnauthorized true', function (t) {
  const script = require('./scripts/ws-tls.json');
  script.config.target = `wss://127.0.0.1:${port}`;
  script.config.ws.rejectUnauthorized = true;
  vuserLauncher(script).then(function (ee) {
    ee.on('done', function (nr) {
      const report = SSMS.legacyReport(nr).report();
      console.log(report);
      t.equal(
        Object.keys(report.errors).length,
        1,
        `Test should run with one error. Got: ${Object.keys(report.errors)}`
      );
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});
