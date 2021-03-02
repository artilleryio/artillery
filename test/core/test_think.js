'use strict';

var test = require('tape');
var runner = require('../../core/lib/runner').runner;
const { SSMS } = require('../../core/lib/ssms');

test('think', function(t) {
  var script = require('./scripts/thinks_http.json');
  runner(script).then(function(ee) {
    ee.on('done', function(nr) {
      const report = SSMS.legacyReport(nr).report();
      t.assert('stats should be empty', report.codes === {});
      t.end();
    });
    ee.run();
  });
});
