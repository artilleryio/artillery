const { test, beforeEach, afterEach } = require('tap');
const runner = require('../..').runner.runner;
const l = require('lodash');
const request = require('got');
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

test('cookie jar http', (t) => {
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
          t.ok(ok, 'Each scenario had a unique cookie');
          if (!ok) {
            console.log(res.body);
            console.log(report);
          }
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

test('cookie jar invalid response', (t) => {
  const script = require('../scripts/cookies_malformed_response.json');
  script.config.target = `http://127.0.0.1:${port}`;

  runner(script).then((ee) => {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();
      t.ok(
        report.codes[200] && report.codes[200] > 0,
        'There should be some 200s'
      );
      t.ok(
        report.errors.cookie_parse_error_invalid_cookie &&
          report.errors.cookie_parse_error_invalid_cookie > 0,
        'There shoud be some cookie errors'
      );
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});

test('setting cookie jar parsing options', (t) => {
  const script = require('../scripts/cookies_malformed_response.json');
  script.config.target = `http://127.0.0.1:${port}`;

  Object.assign(script.config, {
    http: { cookieJarOptions: { looseMode: true } }
  });

  runner(script).then((ee) => {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();
      t.ok(
        report.codes[200] && report.codes[200] > 0,
        'There should be some 200s'
      );

      t.ok(Object.keys(report.errors).length === 0, 'There shoud be no errors');
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});

test('default cookies', (t) => {
  const script = require('../scripts/defaults_cookies.json');
  script.config.target = `http://127.0.0.1:${port}`;

  runner(script).then((ee) => {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();
      t.ok(
        report.codes[200] && report.codes[200] > 0,
        'There should be some 200s'
      );
      t.ok(report.codes[403] === undefined, 'There should be no 403s');
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});

test('default cookies from config.http.defaults instead', (t) => {
  const script = l.cloneDeep(require('../scripts/defaults_cookies.json'));
  script.config.target = `http://127.0.0.1:${port}`;

  const cookie = script.config.defaults.cookie;
  delete script.config.defaults;
  script.config.http = { defaults: { cookie } };

  runner(script).then((ee) => {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();
      t.ok(
        report.codes[200] && report.codes[200] > 0,
        'There should be some 200s'
      );
      t.ok(report.codes[403] === undefined, 'There should be no 403s');
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});

test('default cookies from config.http.defaults should take precedence', (t) => {
  const script = l.cloneDeep(require('../scripts/defaults_cookies.json'));
  script.config.target = `http://127.0.0.1:${port}`;

  const cookie = script.config.defaults.cookie;
  script.config.http = { defaults: { cookie } };
  script.config.defaults.cookie = 'rubbishcookie';

  runner(script).then((ee) => {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();
      t.ok(
        report.codes[200] && report.codes[200] > 0,
        'There should be some 200s'
      );
      t.ok(report.codes[403] === undefined, 'There should be no 403s');
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});

test('no default cookie', (t) => {
  const script = require('../scripts/defaults_cookies.json');
  script.config.target = `http://127.0.0.1:${port}`;

  delete script.config.defaults.cookie;
  runner(script).then((ee) => {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();
      t.ok(
        report.codes[403] && report.codes[403] > 0,
        'There should be some 403s'
      );
      t.ok(report.codes[200] === undefined, 'There should be no 200s');
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});

test('no default cookie still sends cookies defined in script', (t) => {
  const script = require('../scripts/no_defaults_cookies.json');
  script.config.target = `http://127.0.0.1:${port}`;

  runner(script).then((ee) => {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();
      t.ok(
        report.codes[200] && report.codes[200] > 0,
        'There should be some 200s'
      );
      t.ok(report.codes[403] === undefined, 'There should be no 403s');
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});
