'use strict';

var test = require('tape');
var runner = require('../lib/runner').runner;
var l = require('lodash');

test('Capture', function(t) {
  var script = require('./scripts/captures.json');
  var ee = runner(script);
  ee.on('done', function(stats) {
    t.end();
  });
  ee.run();
});
