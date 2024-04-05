'use strict';

const { test, beforeEach, afterEach } = require('tap');
const runner = require('../../lib/runner').runner;
// const createTarget = require('./lib/interfakify').create;
const { updateGlobalObject } = require('../../index');
const { SSMS } = require('../../lib/ssms');
const url = require('url');
const createTestServer = require('../targets/simple');

let server;
let port;
beforeEach(async () => {
  await updateGlobalObject();
  server = await createTestServer(0);
  port = server.info.port;
});

afterEach(() => {
  server.stop();
});

// test('environments - override target', function (t) {
//   const script = require('../scripts/hello_environments.json');
//   runner(script, null, { environment: 'production' }).then(function (ee) {
//     ee.on('done', function (nr) {
//       const report = SSMS.legacyReport(nr).report();
//       console.log(report)
//       t.ok(
//         report.requestsCompleted === 0,
//         'there should be no completed requests'
//       );
//       t.ok(
//         report.errors.ETIMEDOUT && report.errors.ETIMEDOUT > 1,
//         'there should ETIMEDOUT errors'
//       );
//       ee.stop().then(() => {
//         t.end();
//       });
//     });
//     ee.run();
//   });
// });

test('environments - override target and phases', function (t) {
  let startedAt;
  const script = require('../scripts/hello_environments.json');
  script.config.environments.staging.target = `http://127.0.0.1:${port}`;
  // var target = createTarget(
  //   script.scenarios[0].flow,
  //   script.config.environments.staging
  // );
  // target.listen(
  //   url.parse(script.config.environments.staging.target).port || 80
  // );
  runner(script, null, { environment: 'staging' }).then(function (ee) {
    ee.on('done', function (nr) {
      const report = SSMS.legacyReport(nr).report();
      console.log(report);
      const completedAt = process.hrtime(startedAt);
      const delta = (completedAt[0] * 1e9 + completedAt[1]) / 1e6;

      t.ok(report.codes[200], 'stats should not be empty');
      t.ok(delta >= 20 * 1000, "should've run for 20 seconds");
      ee.stop().then(() => {
        t.end();
      });
    });
    startedAt = process.hrtime();
    ee.run();
  });
});
