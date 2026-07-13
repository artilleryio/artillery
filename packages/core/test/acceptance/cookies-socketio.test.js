const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
let runner;
const l = require('lodash');
let request;
let SSMS;
const createTestServer = require('../targets/express_socketio');

let server;
let port;

const __tap = require('node:test');
// Modules under test are ES modules - load before tests run
__tap.before(async () => {
  runner = (await import('../../index.ts')).runner.runner;
  ({ SSMS } = await import('../../lib/ssms.ts'));
});

beforeEach(async () => {
  if (!request) {
    request = (await import('got')).default;
  }
  server = await createTestServer();
  port = server.address().port;
});

afterEach(() => {
  server.close();
});

test('cookie jar socketio', (t, done) => {
  const script = require('../scripts/cookies_socketio.json');
  script.config.target = `http://127.0.0.1:${port}`;

  runner(script).then((ee) => {
    ee.on('done', (nr) => {
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

          assert.ok(hasScenariosCompleted, 'There should be some scenarios completed');
          assert.ok(hasUniqueCookies, 'Each scenario had a unique cookie');

          ee.stop().then(() => {
            done();
          });
        })
        .catch((err) => {
          assert.fail(err);
        });
    });
    ee.run();
  });
});
