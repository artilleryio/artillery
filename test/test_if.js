'use strict';

const test = require('tape');
const runner = require('../lib/runner').runner;
const L = require('lodash');

test('ifTrue', (t) => {
  const script = require('./scripts/iftrue.json');

  let ee = runner(script);
  ee.on('done', (report) => {
    let requests = report.codes[201];
    let expected = 10;
    t.assert(
      requests === expected,
      'Should have ' + expected + ' 201s (pet created)');
    t.assert(report.codes[404] === expected,
             'Should have ' + expected + '404s');
    t.assert(!report.codes[200],
             'Should not have 200s');
    t.end();
  });
  ee.run();
});
