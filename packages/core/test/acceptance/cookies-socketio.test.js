'use strict';

const { test, beforeEach, afterEach } = require('tap');
const runner = require('../..').runner.runner;
const l = require('lodash');
const request = require('got');
const { SSMS } = require('../../lib/ssms');
const createTestServer = require('../targets/express_socketio');

let server;
let port;

beforeEach(async () => {
  server = await createTestServer();
  port = server.address().port;
});

afterEach(() => {
  server.close();
});

test('cookie jar socketio', function (t) {
  const script = require('../scripts/cookies_socketio.json');
  script.config.target = `http://127.0.0.1:${port}`;

  runner(script).then(function (ee) {
    ee.on('done', function (nr) {
      const report = SSMS.legacyReport(nr).report();
      request(`http://127.0.0.1:${port}/_stats`, { responseType: 'json' })
        .then((res) => {
          const hasScenariosCompleted = report.scenariosCompleted;
          const hasUniqueCookies =
            l.size(res.body.cookies) === report.scenariosCompleted;

          if (!hasScenariosCompleted || !hasUniqueCookies) {
            console.log(res.body);
            console.log(report);
          }

          t.ok(
            hasScenariosCompleted,
            'There should be some scenarios completed'
          );
          t.ok(hasUniqueCookies, 'Each scenario had a unique cookie');

          ee.stop().then(() => {
            t.end();
          });
        })
        .catch((err) => {
          t.fail(err);
        });
    });
    ee.run();
  });
});
