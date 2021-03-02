'use strict';

var test = require('tape');
var runner = require('../../core/lib/runner').runner;
const { SSMS } = require('../../core/lib/ssms');

test('concurrent runners', function(t) {
  let script = require('./scripts/hello.json');
  runner(script).then(function(ee1) {
    runner(script).then(function(ee2) {
      let done = 0;

      ee1.on('done', function(nr) {
        const report = SSMS.legacyReport(nr).report();        
        console.log('HTTP 200 count:', report.codes[200]);
        t.assert(report.codes[200] <= 20,
                 'Stats from the other runner don\'t get merged in');
        done++;
        if (done === 2) {
          t.end();
        }
      });

      ee2.on('done', function(nr) {
        const report = SSMS.legacyReport(nr).report();
        t.assert(report.codes[200] <= 20,
                 'Stats from the other runner don\'t get merged in');
        done++;
        if (done === 2) {
          t.end();
        }
      });

      ee1.run();
      ee2.run();
    });
  });
});
