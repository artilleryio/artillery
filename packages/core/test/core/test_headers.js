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

test('Set header inside request', (t) => {
  const xAuthHeader = 'secret';

  const script = {
    config: {
      target: `http://127.0.0.1:${port}`,
      phases: [{ duration: 1, arrivalRate: 1 }]
    },
    scenarios: [
      {
        flow: [
          {
            get: {
              url: '/expectsHeader',
              headers: { 'x-auth': xAuthHeader }
            }
          }
        ]
      }
    ]
  };

  runner(script).then(function (ee) {
    ee.on('done', function (nr) {
      const report = SSMS.legacyReport(nr).report();

      t.equal(
        report.codes[200],
        1,
        `Should have a 200 status code: ${JSON.stringify(report)}`
      );
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});

test('Set header from config.http.defaults', (t) => {
  const xAuthHeader = 'secret';

  const script = {
    config: {
      target: `http://127.0.0.1:${port}`,
      phases: [{ duration: 1, arrivalRate: 1 }],
      http: {
        defaults: {
          headers: { 'x-auth': xAuthHeader }
        }
      }
    },
    scenarios: [
      {
        flow: [
          {
            get: {
              url: '/expectsHeader'
            }
          },
          {
            get: {
              url: '/expectsHeader'
            }
          }
        ]
      }
    ]
  };

  runner(script).then(function (ee) {
    ee.on('done', function (nr) {
      const report = SSMS.legacyReport(nr).report();

      t.equal(
        report.codes[200],
        2,
        `Should have two 200 status code: ${JSON.stringify(report)}`
      );
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});

test('Set header from config.defaults', (t) => {
  const xAuthHeader = 'secret';

  const script = {
    config: {
      target: `http://127.0.0.1:${port}`,
      phases: [{ duration: 1, arrivalRate: 1 }],
      defaults: {
        headers: { 'x-auth': xAuthHeader }
      }
    },
    scenarios: [
      {
        flow: [
          {
            get: {
              url: '/expectsHeader'
            }
          },
          {
            get: {
              url: '/expectsHeader'
            }
          }
        ]
      }
    ]
  };

  runner(script).then(function (ee) {
    ee.on('done', function (nr) {
      const report = SSMS.legacyReport(nr).report();

      t.equal(
        report.codes[200],
        2,
        `Should have two 200 status code: ${JSON.stringify(report)}`
      );
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});
