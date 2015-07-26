'use strict';

var test = require('tape');
var runner = require('../lib/runner').runner;
var l = require('lodash');
var url = require('url');
var createTarget = require('./lib/interfakify').create;

// Does not work with test scripts that include substitutions in URLs.

var SCRIPTS = [
  'hello.json',
  'multiple_phases.json',
  'all_features.json'
  ];

l.each(SCRIPTS, function(fn) {

  var script = require('./scripts/' + fn);
  test('Script: ' + fn, function(t) {

    // Preconditions
    t.assert(
      script.scenarios.length === 1,
      'Expecting the test script to have one scenario'
    );

    // Set up for expectations
    var completedPhases = 0;
    var startedAt = process.hrtime();

    var target = createTarget(script.scenarios[0].flow, script.config);
    target.listen(url.parse(script.config.target).port || 80);

    var ee = runner(script);
    ee.on('phaseStarted', function(x) {
      t.ok(x, 'phaseStarted event emitted');
    });
    ee.on('phaseCompleted', function(x) {
      completedPhases++;
      t.ok(x, 'phaseCompleted event emitted');
    });
    ee.on('stats', function(stats) {
      t.ok(stats, 'intermediate stats event emitted');
    });
    ee.on('done', function(stats) {
      var requests = stats.aggregate.requestsCompleted;
      var scenarios = stats.aggregate.scenariosCompleted;
      console.log('requests = %s, scenarios = %s', requests, scenarios);

      t.assert(completedPhases === script.config.phases.length,
        'Should\'ve completed all phases');
      var completedAt = process.hrtime(startedAt);
      var delta = ((completedAt[0] * 1e9) + completedAt[1]) / 1e6;
      var minDuration = l.foldl(script.config.phases, function(acc, phaseSpec) {
        return acc + (phaseSpec.duration * 1000);
      }, 0);
      t.assert(delta >= minDuration,
        'Should run for at least the total duration of phases');

      target.stop();
      t.end();
    });

    ee.run();
  });
});
