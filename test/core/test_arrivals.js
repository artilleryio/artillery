'use strict';

const test = require('tape');
const runner = require('../../core/lib/runner').runner;

test('arrival phases', function(t) {
  var script = require('./scripts/arrival_phases.json');

  runner(script).then(function(ee) {
    ee.on('phaseStarted', function(info) {
      console.log('Starting phase: %j - %s', info, new Date());
    });
    ee.on('phaseCompleted', function() {
      console.log('Phase completed - %s', new Date());
    });

    ee.on('done', function(stats) {
      t.end();
    });
    ee.run();
  });
});
