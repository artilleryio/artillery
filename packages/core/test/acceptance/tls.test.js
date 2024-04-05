'use strict';

const { test, beforeEach, afterEach } = require('tap');
const runner = require('../../lib/runner').runner;
const { updateGlobalObject } = require('../../index');
const { SSMS } = require('../../lib/ssms');
const createTestServer = require('../targets/simple_tls');

let server;
let port;
beforeEach(async () => {
  await updateGlobalObject();
  const serverInfo = await createTestServer();
  port = serverInfo.port;
  server = serverInfo.server;
});

afterEach(() => {
  server.close();
});

test('tls strict', function (t) {
  const script = require('../scripts/tls-strict.json');
  script.config.target = `https://127.0.0.1:${port}`;
  runner(script).then(function (ee) {
    ee.on('done', function (nr) {
      const report = SSMS.legacyReport(nr).report();
      console.log(report);
      const rejected = report.errors.DEPTH_ZERO_SELF_SIGNED_CERT;
      t.ok(rejected, 'requests to self-signed tls certs fail by default');

      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});

test('tls lax', function (t) {
  const script = require('../scripts/tls-lax.json');
  script.config.target = `https://127.0.0.1:${port}`;
  runner(script).then(function (ee) {
    ee.on('done', function (nr) {
      const report = SSMS.legacyReport(nr).report();
      const rejected = report.errors.DEPTH_ZERO_SELF_SIGNED_CERT;
      const reason =
        'requests to self-signed tls certs pass ' +
        'when `rejectUnauthorized` is false';

      t.ok(rejected == null, reason);

      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});
