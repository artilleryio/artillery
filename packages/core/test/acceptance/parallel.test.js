'use strict';

const { test, beforeEach, afterEach } = require('tap');
const runner = require('../..').runner.runner;
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

test('parallel requests', (t) => {
  const script = require('../scripts/parallel.json');
  script.config.target = `http://127.0.0.1:${port}`;

  runner(script).then(function (ee) {
    ee.on('done', (report) => {
      let scenarios = report.counters['vusers.completed'];
      let requests = report.counters['http.responses'];
      let stepCount = script.scenarios[0].flow[0].parallel.length;
      let expected = scenarios * stepCount;

      t.equal(
        requests,
        expected,
        'Should have ' + stepCount + ' requests for each completed scenario.'
      );
      t.not(scenarios, 0, 'Should have at least 1 scenario successfully run');

      ee.stop().then(() => {
        t.end();
      });
    });

    ee.run();
  });
});
