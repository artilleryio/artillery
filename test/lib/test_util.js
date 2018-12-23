'use strict';

const test = require('tape');

const util = require('../../lib/util');

test('formatting durations', function(t) {
  t.equal(
    util.formatDuration(1000),
    '1 second',
    'Durations with one second are formatted'
  );

  t.equal(
    util.formatDuration(30000),
    '30 seconds',
    'Durations with seconds are formatted'
  );

  t.equal(
    util.formatDuration(90000),
    '1 minute, 30 seconds',
    'Durations with one minute are formatted'
  );

  t.equal(
    util.formatDuration(150000),
    '2 minutes, 30 seconds',
    'Durations with minutes are formatted'
  );

  t.equal(
    util.formatDuration(4530000),
    '1 hour, 15 minutes, 30 seconds',
    'Durations with one hour are formatted'
  );

  t.equal(
    util.formatDuration(8130000),
    '2 hours, 15 minutes, 30 seconds',
    'Durations with hours are formatted'
  );

  t.equal(
    util.formatDuration(108030000),
    '1 day, 6 hours, 0 minutes, 30 seconds',
    'Durations with one day are formatted'
  );

  t.equal(
    util.formatDuration(194430000),
    '2 days, 6 hours, 0 minutes, 30 seconds',
    'Durations with days are formatted'
  );

  t.end();
});
