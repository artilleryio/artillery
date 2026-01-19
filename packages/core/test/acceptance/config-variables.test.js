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

test('config variables', (t) => {
  const script = require('../scripts/config_variables.json');
  script.config.target = `http://127.0.0.1:${port}`;

  runner(script).then((ee) => {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();
      t.ok(report.codes[200] > 0, 'there are 200s for /');
      t.ok(report.codes[404] > 0, 'there are 404s for /will/404');
      ee.stop().then(() => {
        t.end();
      });
    });

    ee.run();
  });
});
