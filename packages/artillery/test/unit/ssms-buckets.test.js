/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const tap = require('tap');
const { SSMS } = require('@artilleryio/int-core').ssms;
const data = require('../data/ssms-buckets.json');

tap.test('Metric buckets', async (t) => {
  const metrics = new SSMS();

  const intermediates = [];

  metrics.on('metricData', (_ts, periodData) => {
    intermediates.push(periodData);
  });

  const expectedCounters = {
    'http.codes.302': 3,
    'http.requests': 3,
    'http.responses': 3
  };

  for (let i = 0; i < data.counters.length; i += 3) {
    const time = data.counters[i];
    const name = data.counters[i + 1];
    const value = data.counters[i + 2];

    metrics.incr(name, value, time);
  }

  metrics.aggregate(true);
  metrics.stop();

  const packedMetrics = SSMS.pack(intermediates);

  // compare
  t.match(
    packedMetrics.counters,
    expectedCounters,
    'should aggregate buckets from different time periods on the final aggregation'
  );
});
