'use strict';

var test = require('tape');
var runner = require('../lib/runner');

test('think', function(t) {
  var script = require('./scripts/thinks_http.json');
  var ee = runner(script);
  ee.on('done', function(stats) {
    t.assert('stats should be empty', stats.report().codes === {});
    t.end();
  });
  ee.run();
});
