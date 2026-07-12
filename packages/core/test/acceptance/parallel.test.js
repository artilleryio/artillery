const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
let runner;
const createTestServer = require('../targets/simple');

let server;
let port;

const __tap = require('node:test');
// Modules under test are ES modules - load before tests run
__tap.before(async () => {
  runner = (await import('../../index.ts')).runner.runner;
});
beforeEach(async () => {
  server = await createTestServer(0);
  port = server.info.port;
});

afterEach(() => {
  server.stop();
});

test('parallel requests', (t, done) => {
  const script = require('../scripts/parallel.json');
  script.config.target = `http://127.0.0.1:${port}`;

  runner(script).then((ee) => {
    ee.on('done', (report) => {
      const scenarios = report.counters['vusers.completed'];
      const requests = report.counters['http.responses'];
      const stepCount = script.scenarios[0].flow[0].parallel.length;
      const expected = scenarios * stepCount;

      assert.strictEqual(requests, expected, `Should have ${stepCount} requests for each completed scenario.`);
      assert.notStrictEqual(scenarios, 0, 'Should have at least 1 scenario successfully run');

      ee.stop().then(() => {
        done();
      });
    });

    ee.run();
  });
});
