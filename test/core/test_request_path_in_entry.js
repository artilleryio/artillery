'use strict';

const test = require('tape');
const runner = require('../../core/lib/runner').runner;

test('arrival phases', function(t) {
  var script = require('./scripts/hello.json');

  runner(script).then(function(ee) {
    ee.on('phaseStarted', function(info) {
      console.log('Starting phase: %j - %s', info, new Date());
    });
    ee.on('phaseCompleted', function() {
      console.log('Phase completed - %s', new Date());
    });
    ee.on('stats', function(stats) {
      t.assert(stats._entries[0].length === 5, 'entry should have 5 fields');
      t.assert(stats._entries[0][4] === 'GET /', 'first entry request path');
      t.assert(stats._entries[1][4] === 'POST /pets', 'second entry request path');
    });
    ee.on('done', function() {
      t.end();
    });
    ee.run();
  });
});
