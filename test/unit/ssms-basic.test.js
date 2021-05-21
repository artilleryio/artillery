const tap = require('tap');
const { SSMS } = require('../../core/lib/ssms');
const { sleep } = require('../cli/_helpers');

tap.test(`Basic metric collection`, async t => {
  const mdb = new SSMS({ pullOnly: true });

  // Write a fixed number of metrics over a fixed small period.
  // By keeping the time window <10s, we can expect the measurements
  // to fall into one or two buckets (two if the test happens to be run
  // near a bucket boundary. e.g. at second 9 past the minute).
  const durationMs = 2 * 1000;
  const numWrites = 300;
  const tick = Math.floor(durationMs / numWrites);

  for(let i = 0; i < numWrites; i++) {
    mdb.counter('num_sprints', 1);
    mdb.histogram('sprint_duration', Math.floor(Math.random() * 1000));
    mdb.rate('sprints');
    await sleep(tick);
  }

  mdb.aggregate(true);
  mdb.stop();

  const buckets = mdb.getBuckets();
  t.ok(buckets.length > 0 && buckets.length <= 2, 'Should have no more than two buckets of metric data');

  const metrics = mdb.getMetrics(buckets[0]);
  t.ok(metrics.histograms['sprint_duration'], 'Should have a summary for sprint_duration histogram');
  t.ok(metrics.counters['num_sprints'], 'Should have num_sprints counter');
  t.ok(metrics.rates['sprints'], 'Should have sprints rate measurement');
});
