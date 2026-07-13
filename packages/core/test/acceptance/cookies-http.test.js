const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
let runner;
const l = require('lodash');
let request;
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
  if (!request) {
    request = (await import('got')).default;
  }
  server = await createTestServer(0);
  port = server.info.port;
});

afterEach(() => {
  server.stop();
});

test('cookie jar http', (t, done) => {
  const script = require('../scripts/cookies.json');
  script.config.target = `http://127.0.0.1:${port}`;

  runner(script).then((ee) => {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();
      request(`http://127.0.0.1:${port}/_stats`, { responseType: 'json' })
        .then((res) => {
          var ok =
            report.scenariosCompleted &&
            l.size(res.body.cookies) === report.scenariosCompleted;
          assert.ok(ok, 'Each scenario had a unique cookie');
          if (!ok) {
            console.log(res.body);
            console.log(report);
          }
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

test('cookie jar invalid response', (t, done) => {
  const script = require('../scripts/cookies_malformed_response.json');
  script.config.target = `http://127.0.0.1:${port}`;

  runner(script).then((ee) => {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();
      assert.ok(report.codes[200] && report.codes[200] > 0, 'There should be some 200s');
      assert.ok(report.errors.cookie_parse_error_invalid_cookie &&
          report.errors.cookie_parse_error_invalid_cookie > 0, 'There shoud be some cookie errors');
      ee.stop().then(() => {
        done();
      });
    });
    ee.run();
  });
});

test('setting cookie jar parsing options', (t, done) => {
  const script = require('../scripts/cookies_malformed_response.json');
  script.config.target = `http://127.0.0.1:${port}`;

  Object.assign(script.config, {
    http: { cookieJarOptions: { looseMode: true } }
  });

  runner(script).then((ee) => {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();
      assert.ok(report.codes[200] && report.codes[200] > 0, 'There should be some 200s');

      assert.ok(Object.keys(report.errors).length === 0, 'There shoud be no errors');
      ee.stop().then(() => {
        done();
      });
    });
    ee.run();
  });
});

test('default cookies', (t, done) => {
  const script = require('../scripts/defaults_cookies.json');
  script.config.target = `http://127.0.0.1:${port}`;

  runner(script).then((ee) => {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();
      assert.ok(report.codes[200] && report.codes[200] > 0, 'There should be some 200s');
      assert.ok(report.codes[403] === undefined, 'There should be no 403s');
      ee.stop().then(() => {
        done();
      });
    });
    ee.run();
  });
});

test('default cookies from config.http.defaults instead', (t, done) => {
  const script = l.cloneDeep(require('../scripts/defaults_cookies.json'));
  script.config.target = `http://127.0.0.1:${port}`;

  const cookie = script.config.defaults.cookie;
  delete script.config.defaults;
  script.config.http = { defaults: { cookie } };

  runner(script).then((ee) => {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();
      assert.ok(report.codes[200] && report.codes[200] > 0, 'There should be some 200s');
      assert.ok(report.codes[403] === undefined, 'There should be no 403s');
      ee.stop().then(() => {
        done();
      });
    });
    ee.run();
  });
});

test('default cookies from config.http.defaults should take precedence', (t, done) => {
  const script = l.cloneDeep(require('../scripts/defaults_cookies.json'));
  script.config.target = `http://127.0.0.1:${port}`;

  const cookie = script.config.defaults.cookie;
  script.config.http = { defaults: { cookie } };
  script.config.defaults.cookie = 'rubbishcookie';

  runner(script).then((ee) => {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();
      assert.ok(report.codes[200] && report.codes[200] > 0, 'There should be some 200s');
      assert.ok(report.codes[403] === undefined, 'There should be no 403s');
      ee.stop().then(() => {
        done();
      });
    });
    ee.run();
  });
});

test('no default cookie', (t, done) => {
  const script = require('../scripts/defaults_cookies.json');
  script.config.target = `http://127.0.0.1:${port}`;

  delete script.config.defaults.cookie;
  runner(script).then((ee) => {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();
      assert.ok(report.codes[403] && report.codes[403] > 0, 'There should be some 403s');
      assert.ok(report.codes[200] === undefined, 'There should be no 200s');
      ee.stop().then(() => {
        done();
      });
    });
    ee.run();
  });
});

test('no default cookie still sends cookies defined in script', (t, done) => {
  const script = require('../scripts/no_defaults_cookies.json');
  script.config.target = `http://127.0.0.1:${port}`;

  runner(script).then((ee) => {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();
      assert.ok(report.codes[200] && report.codes[200] > 0, 'There should be some 200s');
      assert.ok(report.codes[403] === undefined, 'There should be no 403s');
      ee.stop().then(() => {
        done();
      });
    });
    ee.run();
  });
});
