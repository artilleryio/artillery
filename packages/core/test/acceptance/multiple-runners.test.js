const { test, afterEach, beforeEach } = require('node:test');
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

test('concurrent runners', (t, done) => {
  const script = require('../scripts/hello.json');
  script.config.target = `http://127.0.0.1:${port}`;

  runner(script).then((ee1) => {
    runner(script).then((ee2) => {
      let finishedCount = 0;

      ee1.on('done', (nr) => {
        const report = SSMS.legacyReport(nr).report();
        console.log('HTTP 200 count:', report.codes[200]);
        assert.ok(report.codes[200] <= 20, "Stats from the other runner don't get merged in");
        finishedCount++;
        if (finishedCount === 2) {
          ee1.stop().then(() => {
            ee2.stop().then(() => {
              done();
            });
          });
        }
      });

      ee2.on('done', (nr) => {
        const report = SSMS.legacyReport(nr).report();
        assert.ok(report.codes[200] <= 20, "Stats from the other runner don't get merged in");
        finishedCount++;
        if (finishedCount === 2) {
          ee2.stop().then(() => {
            ee1.stop().then(() => {
              done();
            });
          });
        }
      });

      ee1.run();
      ee2.run();
    });
  });
});
