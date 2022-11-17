'use strict';

var { test } = require('tap');
var runner = require('../../core').runner;
const { SSMS } = require('../../core/lib/ssms');

test('think', function (t) {
  var script = require('./scripts/thinks_http.json');
  runner(script).then(function (ee) {
    ee.on('done', function (nr) {
      const report = SSMS.legacyReport(nr).report();
      t.ok('stats should be empty', report.codes === {});
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});
