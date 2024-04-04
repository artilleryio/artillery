'use strict';

const { test, beforeEach, afterEach } = require('tap');
const runner = require('../..').runner.runner;
const fs = require('fs');
const path = require('path');
const csv = require('csv-parse');
const async = require('async');
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

test('single payload', function (t) {
  const fn = path.resolve(__dirname, '../scripts/single_payload.json');
  let script = require(fn);
  script.config.target = `http://127.0.0.1:${port}`;

  let data = fs.readFileSync(path.join(__dirname, '../scripts/data/pets.csv'));
  csv(data, function (err, parsedData) {
    if (err) {
      t.fail(err);
    }

    runner(script, parsedData, {}).then(function (ee) {
      ee.on('phaseStarted', function (x) {
        t.ok(x, 'phaseStarted event emitted');
      });

      ee.on('phaseCompleted', function (x) {
        t.ok(x, 'phaseCompleted event emitted');
      });

      ee.on('stats', function (stats) {
        t.ok(stats, 'intermediate stats event emitted');
      });

      ee.on('done', function (nr) {
        const report = SSMS.legacyReport(nr).report();

        let requests = report.requestsCompleted;
        let scenarios = report.scenariosCompleted;
        t.ok(
          report.codes[404] > 0,
          'There are some 404s (URLs constructed from pets.csv)'
        );
        t.ok(
          report.codes[201] > 0,
          'There are some 201s (POST with valid data from pets.csv)'
        );
        ee.stop().then(() => {
          t.end();
        });
      });

      ee.run();
    });
  });
});

test('multiple_payloads', function (t) {
  const fn = path.resolve(__dirname, '../scripts/multiple_payloads.json');
  let script = require(fn);
  script.config.target = `http://127.0.0.1:${port}`;

  async.map(
    script.config.payload,
    function (item, callback) {
      let payloadFile = path.resolve(path.dirname(fn), item.path);

      let data = fs.readFileSync(payloadFile, 'utf-8');
      csv(data, function (err, parsedData) {
        item.data = parsedData;
        return callback(err, item);
      });
    },
    function (err, results) {
      if (err) {
        console.log(err);
        t.fail(err);
      }

      runner(script, script.config.payload, {}).then(function (ee) {
        ee.on('phaseStarted', function (x) {
          t.ok(x, 'phaseStarted event emitted');
        });

        ee.on('phaseCompleted', function (x) {
          t.ok(x, 'phaseCompleted event emitted');
        });

        ee.on('stats', function (stats) {
          t.ok(stats, 'intermediate stats event emitted');
        });

        ee.on('done', function (nr) {
          const report = SSMS.legacyReport(nr).report();
          let requests = report.requestsCompleted;
          let scenarios = report.scenariosCompleted;
          t.ok(
            report.codes[404] > 0,
            'There are some 404s (URLs constructed from pets.csv)'
          );
          t.ok(
            report.codes[200] > 0,
            'There are some 200s (URLs constructed from urls.csv)'
          );
          t.ok(
            report.codes[201] > 0,
            'There are some 201s (POST with valid data from pets.csv)'
          );
          ee.stop().then(() => {
            t.end();
          });
        });

        ee.run();
      });
    }
  );
});
