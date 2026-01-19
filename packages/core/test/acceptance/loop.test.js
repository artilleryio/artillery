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

test('simple loop', (t) => {
  const script = require('../scripts/loop.json');
  script.config.target = `http://127.0.0.1:${port}`;

  runner(script).then((ee) => {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();

      const scenarios = report.scenariosCompleted;
      const requests = report.requestsCompleted;
      const loopCount = script.scenarios[0].flow[0].count;
      const expected = scenarios * loopCount * 2;
      t.equal(
        requests,
        expected,
        `Should have ${expected} requests for each completed scenario`
      );
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});

test('loop with range', (t) => {
  const script = require('../scripts/loop_range.json');
  script.config.target = `http://127.0.0.1:${port}`;

  runner(script).then((ee) => {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();

      const scenarios = report.scenariosCompleted;
      const requests = report.requestsCompleted;
      const expected = scenarios * 3 * 2;
      const code200 = report.codes[200];
      const code404 = report.codes[404];

      t.equal(
        requests,
        expected,
        `Should have ${expected} requests for each completed scenario`
      );
      t.ok(code200 > 0, 'There should be a non-zero number of 200s');

      // If $loopCount breaks, we'll see 404s here.
      t.notOk(code404, 'There should be no 404s');
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});

test('loop with nested range', (t) => {
  const script = require('../scripts/loop_nested_range.json');
  script.config.target = `http://127.0.0.1:${port}`;

  runner(script).then((ee) => {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();

      const scenarios = report.scenariosCompleted;
      const requests = report.requestsCompleted;
      const expected = scenarios * 3 * 2;
      const code200 = report.codes[200];
      const code404 = report.codes[404];

      t.equal(
        requests,
        expected,
        `Should have ${expected} requests for each completed scenario`
      );
      t.ok(code200 > 0, 'There should be a non-zero number of 200s');

      // If $loopCount breaks, we'll see 404s here.
      t.notOk(code404, 'There should be no 404s');
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});
