/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const tap = require('tap');
const { SSMS } = require('../../core/lib/ssms');
const { sleep } = require('../cli/_helpers');
const data = require('../data/geometric.json');
const path = require('path');
const _ = require('lodash');

const { Worker } = require('worker_threads');

// Test description:
// - Create several SSMS instances and a single "control" instance
// - The same dataset is distributed across multiple instances, and written to
//   the single control instance
// - Compare aggregated results from multiple instances with those in the
//   control instance -- we expect them to match.
//
// The code in the test case acts as the aggregator of metrics from multiple
// workers.

tap.test('Metric aggregation', async t => {
  const control = new SSMS({ pullOnly: true });
  const metricData = {}; // indexed by timestamp (as string) -> [summaries]

  const NUM_WORKERS = 4;
  const workers = [];
  let workersRunning = 0;

  for (let i = 0; i < NUM_WORKERS; i++) {
    const worker = new Worker(path.resolve(__dirname, 'ssms-worker.js'));
    workers.push(worker);
    workersRunning++;

    worker.on('message', (message) => {
      if (message.event === 'metricData') {
        const md = SSMS.deserializeMetrics(message.metricData);
        if (!metricData[md.period]) {
          metricData[md.period] = [];
        }
        metricData[md.period].push(md);
      }
    });

    worker.on('error', (err) => {
      console.log(err);
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        console.log(new Error(`Worker stopped with exit code ${code}`));
      }
      workersRunning--;
    });
  }

  t.comment('worker count:', workers.length);

  const histogramNames = [
    'core.engines.http.response_time',
    'plugin.my_custom_plugin.important_histogram',
    'core.vusers.session_duration'
  ];

  const counterNames = [
    'core.vusers.created',
    'plugin.my_custom_plugin.important_counter'
  ];

  const rateNames = [
    'core.vusers.launch_rate',
    'engines.mqtt.message_rate',
    'plugin.my_custom_plugin.op_rate'
  ];

  const dataPoints = data[0];
  t.comment(`writing ${dataPoints.length} measurements`);
  for (const dp of dataPoints) {
    const ts = Date.now();
    // pick a histogram name, a counter name, and a worker which will record these measurements
    const hname = _.sample(histogramNames);
    const cname = _.sample(counterNames);
    const dest = _.sample(workers);
    dest.postMessage({cmd: 'histogram', name: hname, value: dp, ts: ts});
    dest.postMessage({cmd: 'incr', name: cname, value: 1, ts: ts});
    // we also record the same measurement in our control instance:
    control.histogram(hname, dp, ts);
    control.incr(cname, 1, ts);
    await sleep(_.random(1, 50));
  }

  await sleep(1000);

  for(const worker of workers) {
    worker.postMessage({ cmd: 'exit' });
  }

  // Wait for all workers to exit
  while(true) {
    await sleep(500);
    if (workersRunning === 0) {
      break;
    }
  }

  control.aggregate(true);
  control.stop();

  // Now we can compare:

  for(const [bucket, summaries] of Object.entries(metricData)) {
    t.comment(`number of summaries in bucket: ${bucket} -> ${summaries.length}}`);
    t.ok(summaries.length >= 1, 'Should have a summary from at least one worker for each bucket');
  }

  t.ok(_.isEqual(Object.keys(metricData).sort(), control.getBucketIds().sort()), 'Should have the same set of buckets');
  console.log(Object.keys(metricData).sort(), control.getBucketIds().sort());

  const combined = {};
  for (const [bucket, summaries] of Object.entries(metricData)) {
    const merged = SSMS.mergeBuckets(summaries);
    combined[Object.keys(merged)[0]] = merged[Object.keys(merged)[0]]; // we only expect merged object to have one key
  }

  //
  // Compare aggregated metrics with those recorded in the "control" SSMS instance
  //
  for(const [bucketId, summary] of Object.entries(combined)) {
    t.comment(`bucketId: ${bucketId}, typeof = ${typeof bucketId}`);
    const controlSummary = control.getMetrics(bucketId);

    t.ok(_.isEqual(summary.counters, controlSummary.counters), 'Aggregated counter values should be the same');

    for(const [hname, h] of Object.entries(summary.histograms)) {
      t.comment(`histogram: ${hname}`);
      t.ok(h.min === controlSummary.histograms[hname].min, 'min values should be equal');
      t.ok(h.p99 === controlSummary.histograms[hname].p99, 'p99 values should be equal');
      t.ok(h.count === controlSummary.histograms[hname].count, 'count values should be equal');
    }

    // TODO: Add rates

    // Metadata:
    t.comment('period comparison', summary.period, typeof summary.period, controlSummary.period, typeof controlSummary.period);
    t.ok(summary.period === controlSummary.period, 'bucket id should be the same');
    t.ok(summary.lastMetricAt === controlSummary.lastMetricAt, 'lastMetricAt should be equal');
    t.ok(summary.lastCounterAt === controlSummary.lastCounterAt, 'lastCounterAt should be equal');
    t.ok(summary.firstHistogramAt === controlSummary.firstHistogramAt, 'firstHistogramAt should be equal');
  }
});