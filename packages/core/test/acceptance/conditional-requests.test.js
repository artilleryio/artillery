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

test('ifTrue', (t, done) => {
  const script = require('../scripts/iftrue.json');
  script.config.target = `http://127.0.0.1:${port}`;

  runner(script).then((ee) => {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();
      const requests = report.codes[201];
      const expected = 10;
      assert.strictEqual(requests, expected, `Should have ${expected} 201s (pet created)`);
      assert.strictEqual(report.codes[404], expected, `Should have ${expected}404s`);
      assert.ok(!(report.codes[200]), 'Should not have 200s');

      ee.stop().then(() => {
        done();
      });
    });
    ee.run();
  });
});
