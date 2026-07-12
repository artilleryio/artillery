const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const core = require('../../..');
const vuserLauncher = core.runner.runner;
const { SSMS } = require('../../../lib/ssms.ts');
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

test('TLS - with rejectUnauthorized false', (t, done) => {
  const script = require('./scripts/ws-tls.json');
  script.config.target = `wss://127.0.0.1:${port}`;
  vuserLauncher(script).then((ee) => {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();
      console.log(report);
      assert.ok(Object.keys(report.errors).length === 0, 'Test ran without errors');
      ee.stop().then(() => {
        done();
      });
    });
    ee.run();
  });
});

test('TLS - with rejectUnauthorized true', (t, done) => {
  const script = require('./scripts/ws-tls.json');
  script.config.target = `wss://127.0.0.1:${port}`;
  script.config.ws.rejectUnauthorized = true;
  vuserLauncher(script).then((ee) => {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();
      console.log(report);
      assert.strictEqual(Object.keys(report.errors).length, 2, `Test should run with two errors. Got: ${Object.keys(report.errors)}`);
      ee.stop().then(() => {
        done();
      });
    });
    ee.run();
  });
});
