'use strict';

const test = require('tape');
const runner = require('../../core').runner;
const { SSMS } = require('../../core/lib/ssms');

test('HTTP basic auth', (t) => {
  const script = require('./scripts/hello_basic_auth.json');

  runner(script).then(function(ee) {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();
      let requests = report.requestsCompleted;
      let code200 = report.codes[200];
      let code401 = report.codes[401];
      t.assert(
        requests > 0 && (code200 === code401 * 2),
        `Expected twice as many 200s as 401s, got ${code200} 200s and ${code401} 401s`);
      ee.stop(() => {
        t.end();
      });

    });
    ee.run();
  });
});
