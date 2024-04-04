'use strict';

var { test } = require('tap');
var runner = require('../../lib/runner').runner;
var createTarget = require('./lib/interfakify').create;
var url = require('url');

test('environments - override target', function (t) {
  var script = require('../scripts/hello_environments.json');
  runner(script, null, { environment: 'production' }).then(function (ee) {
    ee.on('done', function (report) {
      t.ok(
        report.requestsCompleted === 0,
        'there should be no completed requests'
      );
      t.ok(
        report.errors.ETIMEDOUT && report.errors.ETIMEDOUT > 1,
        'there should ETIMEDOUT errors'
      );
      t.end();
    });
    ee.run();
  });
});

test('environments - override target and phases', function (t) {
  var startedAt;
  var script = require('../scripts/hello_environments.json');
  var target = createTarget(
    script.scenarios[0].flow,
    script.config.environments.staging
  );
  target.listen(
    url.parse(script.config.environments.staging.target).port || 80
  );
  runner(script, null, { environment: 'staging' }).then(function (ee) {
    ee.on('done', function (report) {
      var completedAt = process.hrtime(startedAt);
      var delta = (completedAt[0] * 1e9 + completedAt[1]) / 1e6;

      t.ok(report.codes[200], 'stats should not be empty');
      t.ok(delta >= 20 * 1000, "should've run for 20 seconds");
      target.stop();
      t.end();
    });
    startedAt = process.hrtime();
    ee.run();
  });
});
