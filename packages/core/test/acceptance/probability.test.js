const { test, beforeEach, afterEach } = require('tap');
let runner;
let SSMS;
const createTestServer = require('../targets/simple');

let server;
let port;

const __tap = require('tap');
// Modules under test are ES modules - load before tests run
__tap.before(async () => {
  runner = (await import('../../index.ts')).runner.runner;
  ({ SSMS } = await import('../../lib/ssms.ts'));
});
beforeEach(async () => {
  server = await createTestServer(0);
  port = server.info.port;
});

afterEach(() => {
  server.stop();
});

test('request probability', (t) => {
  const script = require('../scripts/probability.json');
  script.config.target = `http://127.0.0.1:${port}`;

  runner(script).then((ee) => {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();
      const requests = report.requestsCompleted;
      t.ok(
        requests < 130,
        `Should have completed ~10% = ~100 requests in total. Actually completed ${requests} requests`
      );
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});
