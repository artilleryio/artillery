'use strict';

const { test, afterEach, beforeEach } = require('tap');
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

test('concurrent runners', function (t) {
  let script = require('../scripts/hello.json');
  script.config.target = `http://127.0.0.1:${port}`;

  runner(script).then(function (ee1) {
    runner(script).then(function (ee2) {
      let done = 0;

      ee1.on('done', function (nr) {
        const report = SSMS.legacyReport(nr).report();
        console.log('HTTP 200 count:', report.codes[200]);
        t.ok(
          report.codes[200] <= 20,
          "Stats from the other runner don't get merged in"
        );
        done++;
        if (done === 2) {
          ee1.stop().then(() => {
            ee2.stop().then(() => {
              t.end();
            });
          });
        }
      });

      ee2.on('done', function (nr) {
        const report = SSMS.legacyReport(nr).report();
        t.ok(
          report.codes[200] <= 20,
          "Stats from the other runner don't get merged in"
        );
        done++;
        if (done === 2) {
          ee2.stop().then(() => {
            ee1.stop().then(() => {
              t.end();
            });
          });
        }
      });

      ee1.run();
      ee2.run();
    });
  });
});
