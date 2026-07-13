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

test('arrival phases', (t, done) => {
  const script = require('../scripts/arrival_phases.json');
  script.config.target = `http://127.0.0.1:${port}`;

  runner(script).then((ee) => {
    ee.on('phaseStarted', (info) => {
      console.log('Starting phase: %j - %s', info, new Date());
    });
    ee.on('phaseCompleted', () => {
      console.log('Phase completed - %s', new Date());
    });

    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();

      assert.strictEqual(report.codes[200], 60, 'Should get 60 status 200 responses');

      ee.stop().then(() => {
        done();
      });
    });
    ee.run();
  });
});

test('arrival phases - with modified time format', (t, done) => {
  const script = require('../scripts/arrival_phases_time_format.json');
  script.config.target = `http://127.0.0.1:${port}`;

  const initialTime = Date.now();

  runner(script).then((ee) => {
    ee.on('phaseStarted', (info) => {
      console.log('Starting phase: %j - %s', info, new Date());
    });
    ee.on('phaseCompleted', () => {
      console.log('Phase completed - %s', new Date());
    });

    ee.on('done', (nr) => {
      const finalTime = Date.now();
      const report = SSMS.legacyReport(nr).report();

      assert.strictEqual(report.codes[200], 61, 'Did not get 61 status 200 responses');
      assert.ok(finalTime - initialTime >= 50 * 1000, `Took ${
          finalTime - initialTime
        }ms. Did not take at least 50 seconds (to account for pause time)`);

      ee.stop().then(() => {
        done();
      });
    });
    ee.run();
  });
});
