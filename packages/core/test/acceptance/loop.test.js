const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
let runner;
let SSMS;
const createTestServer = require('../targets/simple');

let server;
let port;

const __tap = require('node:test');
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

test('simple loop', (t, done) => {
  const script = require('../scripts/loop.json');
  script.config.target = `http://127.0.0.1:${port}`;

  runner(script).then((ee) => {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();

      const scenarios = report.scenariosCompleted;
      const requests = report.requestsCompleted;
      const loopCount = script.scenarios[0].flow[0].count;
      const expected = scenarios * loopCount * 2;
      assert.strictEqual(requests, expected, `Should have ${expected} requests for each completed scenario`);
      ee.stop().then(() => {
        done();
      });
    });
    ee.run();
  });
});

test('loop with range', (t, done) => {
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

      assert.strictEqual(requests, expected, `Should have ${expected} requests for each completed scenario`);
      assert.ok(code200 > 0, 'There should be a non-zero number of 200s');

      // If $loopCount breaks, we'll see 404s here.
      assert.ok(!(code404), 'There should be no 404s');
      ee.stop().then(() => {
        done();
      });
    });
    ee.run();
  });
});

test('loop with nested range', (t, done) => {
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

      assert.strictEqual(requests, expected, `Should have ${expected} requests for each completed scenario`);
      assert.ok(code200 > 0, 'There should be a non-zero number of 200s');

      // If $loopCount breaks, we'll see 404s here.
      assert.ok(!(code404), 'There should be no 404s');
      ee.stop().then(() => {
        done();
      });
    });
    ee.run();
  });
});
