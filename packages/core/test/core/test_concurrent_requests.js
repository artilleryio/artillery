'use strict';

const { test, beforeEach, afterEach } = require('tap');
const runner = require('../..').runner.runner;
const { SSMS } = require('../../lib/ssms');
const createTestServer = require('./targets/simple');

let server;
let port;
beforeEach(async () => {
  server = await createTestServer(0);
  port = server.info.port;
});

afterEach(() => {
  server.stop();
});

test('scenarios avoided - arrival rate', function (t) {
  const script = require('./scripts/concurrent_requests_arrival_rate.json');
  script.config.target = `http://127.0.0.1:${port}`;
  console.log('script', script);

  runner(script).then(function (ee) {
    ee.on('phaseStarted', function (info) {
      console.log('Starting phase: %j - %s', info, new Date());
    });
    ee.on('phaseCompleted', function () {
      console.log('Phase completed - %s', new Date());
    });

    ee.on('done', function (nr) {
      const stats = SSMS.legacyReport(nr).report();

      t.equal(stats.codes['200'], 1, 'Should make expected number of requests');
      t.equal(stats.scenariosAvoided, 999, 'Should skip all other VUs');
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});

//FIXME: This test sometimes fails, it seems arrival counts arent consistent under maxvuser
// test('scenarios avoided - arrival count', function (t) {
//   const script = require('./scripts/concurrent_requests_arrival_count.json');
//   script.config.target = `http://127.0.0.1:${port}`;
//   console.log('script', script)

//   runner(script).then(function (ee) {
//     ee.on('phaseStarted', function (info) {
//       console.log('Starting phase: %j - %s', info, new Date());
//     });
//     ee.on('phaseCompleted', function () {
//       console.log('Phase completed - %s', new Date());
//     });

//     ee.on('done', function (nr) {
//       const stats = SSMS.legacyReport(nr).report();
//       // console.log(stats)
//       t.equal(stats.codes['200'], 1, 'Should make expected number of requests');
//       t.equal(stats.scenariosAvoided, 999, 'Should skip all other VUs');
//       ee.stop().then(() => {
//         t.end();
//       });
//     });
//     ee.run();
//   });
// });

test('scenarios avoided - ramp to', function (t) {
  const script = require('./scripts/concurrent_requests_ramp_to.json');
  script.config.target = `http://127.0.0.1:${port}`;
  console.log('script', script);

  runner(script).then(function (ee) {
    ee.on('phaseStarted', function (info) {
      console.log('Starting phase: %j - %s', info, new Date());
    });
    ee.on('phaseCompleted', function () {
      console.log('Phase completed - %s', new Date());
    });

    ee.on('done', function (nr) {
      const stats = SSMS.legacyReport(nr).report();
      t.ok(stats.codes['200'] > 0, 'should receive some 200s');
      t.ok(stats.scenariosAvoided > 0, 'should avoid some scenarios');
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});

test('scenarios avoided - multiple phases', function (t) {
  const script = require('./scripts/concurrent_requests_multiple_phases.json');
  script.config.target = `http://127.0.0.1:${port}`;

  runner(script).then(function (ee) {
    ee.on('phaseStarted', function (info) {
      console.log('Starting phase: %j - %s', info, new Date());
    });
    ee.on('phaseCompleted', function () {
      console.log('Phase completed - %s', new Date());
    });

    ee.on('done', function (nr) {
      const stats = SSMS.legacyReport(nr).report();
      t.ok(stats.codes['200'] > 0, 'should receive some 200s');
      t.ok(stats.scenariosAvoided > 0, 'should avoid some scenarios');
      t.ok(stats.scenariosAvoided < 1000, 'should avoid less than 1000');
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});
