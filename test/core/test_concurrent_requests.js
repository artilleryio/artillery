'use strict';

const test = require('tape');
const runner = require('../../core/lib/runner').runner;
test('scenarios avoided', function(t) {
  var script = require('./scripts/concurrent_requests.json');
  process.env.CONCURRENCY_LIMIT = 10;
  runner(script).then(function(ee) {
    ee.on('phaseStarted', function(info) {
      console.log('Starting phase: %j - %s', info, new Date());
    });
    ee.on('phaseCompleted', function() {
      console.log('Phase completed - %s', new Date());
    });

    ee.on('done', function(stats) {
      t.assert(stats.scenariosAvoided > 0, 'should avoid some scenarios');
      t.end();
    });
    ee.run();
  });
});
