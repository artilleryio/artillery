'use strict';

var test = require('tape');
var runner = require('../lib/runner').runner;

test('environments', function(t) {
  var script = require('./scripts/hello_environments.json');
  var ee = runner(script, null, { environment: 'production' });
  ee.on('done', function(stats) {
    t.assert('stats should be empty', stats.aggregate.codes === {});
    t.assert('there should ECONNREFUSED errors',
      stats.aggregate.errors.ECONNREFUSED &&
      stats.aggregate.errors.ECONNREFUSED > 1);
    t.end();
  });
  ee.run();
});
