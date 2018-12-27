'use strict';

const test = require('tape');
const runner = require('../../core/lib/runner').runner;
const customFunctions = __dirname + '/customFunctions.js';

test('Custom functions', function(t) {
  let script = require('./scripts/custom_functions.json');
  script.config.customFunctions = customFunctions;

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
