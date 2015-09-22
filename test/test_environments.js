'use strict';

var test = require('tape');
var runner = require('../lib/runner').runner;
var createTarget = require('./lib/interfakify').create;
var url = require('url');

test('environments - override target', function(t) {
  var script = require('./scripts/hello_environments.json');
  var ee = runner(script, null, {environment: 'production'});
  ee.on('done', function(stats) {
    t.assert(stats.aggregate.requestsCompleted === 0,
      'there should be no completed requests');
    t.assert(
      stats.aggregate.errors.ETIMEDOUT &&
      stats.aggregate.errors.ETIMEDOUT > 1,
      'there should ETIMEDOUT errors');
    t.end();
  });
  ee.run();
});

test('environments - override target and phases', function(t) {
  var startedAt;
  var script = require('./scripts/hello_environments.json');
  var target = createTarget(script.scenarios[0].flow,
    script.config.environments.staging);
  target.listen(
    url.parse(script.config.environments.staging.target).port || 80);
  var ee = runner(script, null, {environment: 'staging'});
  ee.on('done', function(stats) {
    var completedAt = process.hrtime(startedAt);
    var delta = ((completedAt[0] * 1e9) + completedAt[1]) / 1e6;

    t.assert(stats.aggregate.codes[200], 'stats should not be empty');
    t.assert(delta >= 20 * 1000, 'should\'ve run for 20 seconds');
    target.stop();
    t.end();
  });
  startedAt = process.hrtime();
  ee.run();
});
