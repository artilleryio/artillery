const { test } = require('tap');
const runner = require('../..').runner.runner;
const { SSMS } = require('../../lib/ssms');

test('Set header inside request', (t) => {
  const xAuthHeader = 'secret';

  const script = {
    config: {
      target: 'http://127.0.0.1:3003',
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
      target: 'http://127.0.0.1:3003',
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
      target: 'http://127.0.0.1:3003',
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
