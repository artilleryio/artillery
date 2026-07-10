const { test, beforeEach, afterEach } = require('tap');
let runner;
let updateGlobalObject;
let SSMS;
const createTestServer = require('../targets/simple_tls');

let server;
let port;

const __tap = require('tap');
// Modules under test are ES modules - load before tests run
__tap.before(async () => {
  runner = (await import('../../lib/runner.ts')).runner;
  ({ SSMS } = await import('../../lib/ssms.ts'));
  ({ updateGlobalObject } = await import('../../index.ts'));
});
beforeEach(async () => {
  await updateGlobalObject();
  const serverInfo = await createTestServer();
  port = serverInfo.port;
  server = serverInfo.server;
});

afterEach(() => {
  server.close();
});

test('tls strict', (t) => {
  const script = require('../scripts/tls-strict.json');
  script.config.target = `https://127.0.0.1:${port}`;
  runner(script).then((ee) => {
    ee.on('done', (nr) => {
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

test('tls lax', (t) => {
  const script = require('../scripts/tls-lax.json');
  script.config.target = `https://127.0.0.1:${port}`;
  runner(script).then((ee) => {
    ee.on('done', (nr) => {
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
