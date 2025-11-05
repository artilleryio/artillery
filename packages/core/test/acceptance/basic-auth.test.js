const { test, beforeEach, afterEach } = require('tap');
const runner = require('../..').runner.runner;
const { SSMS } = require('../../lib/ssms');
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

test('HTTP basic auth', (t) => {
  const script = require('../scripts/hello_basic_auth.json');
  script.config.target = `http://127.0.0.1:${port}`;

  runner(script).then((ee) => {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();
      const requests = report.requestsCompleted;
      const code200 = report.codes[200];
      const code401 = report.codes[401];

      t.ok(requests > 0, 'Did not get any requests');

      t.equal(
        code200,
        code401 * 2,
        `Expected twice as many 200s as 401s, got ${code200} 200s and ${code401} 401s`
      );
      t.equal(report.codes[200], 20, 'Should get twenty 200s');
      t.equal(report.codes[401], 10, 'Should get ten 401s');
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});
