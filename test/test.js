'use strict';

var test = require('tape');
var runner = require('../lib/runner');
var fs = require('fs');
var Interfake = require('interfake');
var _ = require('lodash');

test('Basics', function(t) {

  fs.readFile('test/scripts/hello.json', 'utf-8', function(err, contents) {

    if (err) {
      t.end(err);
    }

    var testScript = JSON.parse(contents);

    //
    // Check our assumptions about the test script
    //
    t.assert(
      testScript.config.phases.length === 1,
      'Expecting the test script to have one phase');
    t.assert(
      testScript.scenarios.length === 1,
      'Expecting the test script to have one scenario'
    );
    t.assert(
      testScript.scenarios[0].flow.length === 1,
      'Expecting the scenario to consist of just one request'
    );

    //
    // Set up our target
    //
    var interfakeOpts = {};
    if (process.env.DEBUG && process.env.DEBUG.match(/interfake/)) {
      interfakeOpts.debug = true;
    }
    var target = new Interfake(interfakeOpts);
    target.get('/test').status(200);
    target.listen(3000);

    //
    // Run the test
    //
    var ee = runner(testScript);

    ee.on('phaseStarted', function(opts) {

      t.ok(opts, 'phaseStarted event emitted');
    });

    ee.on('phaseCompleted', function(opts) {

      t.ok(opts, 'phaseCompleted event emitted');
    });

    ee.on('stats', function(stats) {

      t.ok(stats, 'intermediate stats event emitted');
    });

    ee.on('done', function(stats) {

      t.ok(stats, 'done event emitted');
      var plausibleMax = testScript.config.phases[0].users * 1.1;
      var plausibleMin = plausibleMax * 0.8;

      var requests = stats.completedRequests.toJSON();
      var scenarios = stats.completedScenarios.toJSON();
      console.log('requests = %s, scenarios = %s', requests, scenarios);
      t.assert(
        requests >= plausibleMin && requests <= plausibleMax,
        'Reported plausible # of requests performed');
      t.assert(
        scenarios >= plausibleMin && scenarios <= plausibleMax,
        'Reported plausible # of scenarios performed');
      target.stop();
      t.end();
    });
    ee.run();
  });

});

test('Multiple phases', function(t) {
  fs.readFile('test/scripts/multiple_phases.json', 'utf-8',
    function(err, contents) {

      if (err) {
        t.end(err);
      }

      var testScript = JSON.parse(contents);

      //
      // Set up our target
      //
      var interfakeOpts = {};
      if (process.env.DEBUG && process.env.DEBUG.match(/interfake/)) {
        interfakeOpts.debug = true;
      }
      var target = new Interfake(interfakeOpts);
      target.get('/test').status(200);
      target.listen(3000);

      var expectedPhases = testScript.config.phases.length * 2;
      var expectedStats = Math.floor(_.foldl(
        testScript.config.phases, function(acc, phase) {
          acc += phase.duration / 10;
          return acc;
        }, 0));

      console.log('expectedPhases: %s, expectedStats: %s',
        expectedPhases, expectedStats);

      t.plan(expectedPhases + expectedStats);

      //
      // Run the test
      //
      var ee = runner(testScript);
      ee.on('phaseStarted', function(x) {
        t.ok(x, 'phaseStarted event emitted');
      });
      ee.on('phaseCompleted', function(x) {
        t.ok(x, 'phaseCompleted event emitted');
      });
      ee.on('stats', function(stats) {
        t.ok(stats, 'intermediate stats event emitted');
      });
      ee.on('done', function(stats) {
        target.stop();
        t.end();
      });

      ee.run();
    });
});

//
//
//
test('All features', function(t) {
  fs.readFile('test/scripts/all_features.json', 'utf-8',
    function(err, contents) {

      if (err) {
        t.end(err);
      }

      var testScript = JSON.parse(contents);

      //
      // Set up our target
      //
      var interfakeOpts = {};
      if (process.env.DEBUG && process.env.DEBUG.match(/interfake/)) {
        interfakeOpts.debug = true;
      }
      var target = new Interfake(interfakeOpts);
      target.get('/test').status(200);
      target.post('/test').status(200);
      target.listen(3002);

      //
      // Run the test
      //
      var ee = runner(testScript);
      ee.on('phaseStarted', function(x) {
        t.ok(x, 'phaseStarted event emitted');
      });
      ee.on('phaseCompleted', function(x) {
        t.ok(x, 'phaseCompleted event emitted');
      });
      ee.on('stats', function(stats) {
        t.ok(stats, 'intermediate stats event emitted');
      });
      ee.on('done', function(stats) {
        _.each(stats, function(v, k) {
          console.log('%s -> %s', k, JSON.stringify(v));
        });
        target.stop();
        t.end();
      });

      ee.run();
    });
});
