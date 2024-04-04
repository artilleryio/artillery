'use strict';

const { test } = require('tap');
const runner = require('../..').runner.runner;
const { SSMS } = require('../../lib/ssms');

test('config variables', function (t) {
  const script = require('../scripts/config_variables.json');
  runner(script).then(function (ee) {
    ee.on('done', function (nr) {
      const report = SSMS.legacyReport(nr).report();
      t.ok(report.codes[200] > 0, 'there are 200s for /');
      t.ok(report.codes[404] > 0, 'there are 404s for /will/404');
      t.end();
    });
    ee.run();
  });
});
