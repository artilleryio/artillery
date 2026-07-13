const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
let runner;
const fs = require('node:fs');
const path = require('node:path');
const csv = require('csv-parse');
const async = require('async');
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

test('single payload', (t, done) => {
  const fn = path.resolve(__dirname, '../scripts/single_payload.json');
  const script = require(fn);
  script.config.target = `http://127.0.0.1:${port}`;

  const data = fs.readFileSync(
    path.join(__dirname, '../scripts/data/pets.csv')
  );
  csv(data, (err, parsedData) => {
    if (err) {
      assert.fail(err);
    }

    runner(script, parsedData, {}).then((ee) => {
      ee.on('phaseStarted', (x) => {
        assert.ok(x, 'phaseStarted event emitted');
      });

      ee.on('phaseCompleted', (x) => {
        assert.ok(x, 'phaseCompleted event emitted');
      });

      ee.on('stats', (stats) => {
        assert.ok(stats, 'intermediate stats event emitted');
      });

      ee.on('done', (nr) => {
        const report = SSMS.legacyReport(nr).report();

        const _requests = report.requestsCompleted;
        const _scenarios = report.scenariosCompleted;
        assert.ok(report.codes[404] > 0, 'There are some 404s (URLs constructed from pets.csv)');
        assert.ok(report.codes[201] > 0, 'There are some 201s (POST with valid data from pets.csv)');
        ee.stop().then(() => {
          done();
        });
      });

      ee.run();
    });
  });
});

test('multiple_payloads', (t, done) => {
  const fn = path.resolve(__dirname, '../scripts/multiple_payloads.json');
  const script = require(fn);
  script.config.target = `http://127.0.0.1:${port}`;

  async.map(
    script.config.payload,
    (item, callback) => {
      const payloadFile = path.resolve(path.dirname(fn), item.path);

      const data = fs.readFileSync(payloadFile, 'utf-8');
      csv(data, (err, parsedData) => {
        item.data = parsedData;
        return callback(err, item);
      });
    },
    (err, _results) => {
      if (err) {
        console.log(err);
        assert.fail(err);
      }

      runner(script, script.config.payload, {}).then((ee) => {
        ee.on('phaseStarted', (x) => {
          assert.ok(x, 'phaseStarted event emitted');
        });

        ee.on('phaseCompleted', (x) => {
          assert.ok(x, 'phaseCompleted event emitted');
        });

        ee.on('stats', (stats) => {
          assert.ok(stats, 'intermediate stats event emitted');
        });

        ee.on('done', (nr) => {
          const report = SSMS.legacyReport(nr).report();
          const _requests = report.requestsCompleted;
          const _scenarios = report.scenariosCompleted;
          assert.ok(report.codes[404] > 0, 'There are some 404s (URLs constructed from pets.csv)');
          assert.ok(report.codes[200] > 0, 'There are some 200s (URLs constructed from urls.csv)');
          assert.ok(report.codes[201] > 0, 'There are some 201s (POST with valid data from pets.csv)');
          ee.stop().then(() => {
            done();
          });
        });

        ee.run();
      });
    }
  );
});
