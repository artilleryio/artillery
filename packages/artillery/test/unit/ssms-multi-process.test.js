/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const tap = require('tap');
const { SSMS } = require('@artilleryio/int-core').ssms;
const sleep = require('../helpers/sleep');
const data = require('../data/geometric.json');
const responseTimeHistogramsData = require('../data/response-times-histograms.json');
const path = require('path');
const _ = require('lodash');
const fs = require('fs');

const { Worker } = require('worker_threads');

const MEASUREMENTS = [];

// Test description:
// - Create several SSMS instances and a single "control" instance
// - The same dataset is distributed across multiple instances, and written to
//   the single control instance
// - Compare aggregated results from multiple instances with those in the
//   control instance -- we expect them to match.
//
// The code in the test case acts as the aggregator of metrics from multiple
// workers.

tap.teardown(async () => {
  if (process.env.DEBUG) {
    console.log(JSON.stringify(MEASUREMENTS));
  }
});

tap.test('Metric aggregation', async (t) => {
  const control = new SSMS({ pullOnly: true });
  const metricData = {}; // indexed by timestamp (as string) -> [summaries]

  const NUM_WORKERS = 7;
  const workers = [];
  let workersRunning = 0;

  for (let i = 0; i < NUM_WORKERS; i++) {
    const worker = new Worker(path.resolve(__dirname, 'ssms-worker.js'));

    workers.push(worker);
    workersRunning++;

    worker.on('message', (message) => {
      if (message.event === 'metricData') {
        const md = SSMS.deserializeMetrics(message.metricData);
        md.metadata = { workerId: message.workerId };
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
    'engines.http.response_time',
    'plugin.my_custom_plugin.important_histogram',
    'vusers.session_duration'
  ];

  const counterNames = [
    'vusers.created',
    'plugin.my_custom_plugin.important_counter'
  ];

  const rateNames = [
    'vusers.launch_rate',
    'mqtt.message_rate',
    'plugin.my_custom_plugin.op_rate'
  ];

  let dataPoints = [];
  for (let i = 0; i < 1; i++) {
    dataPoints = dataPoints.concat(data[i]);
  }
  t.comment(`writing ${dataPoints.length} measurements`);

  if (!process.env.FROM_DATA_FILE) {
    // Main test:
    for (const dp of dataPoints) {
      const ts = Date.now();
      // pick a histogram name, a counter name, and a worker which will record these measurements
      const hname = _.sample(histogramNames);
      const cname = _.sample(counterNames);
      const workerIndex = _.random(0, workers.length - 1);

      const [dest] = workers.filter((w, idx) => idx === workerIndex);

      dest.postMessage({ cmd: 'histogram', name: hname, value: dp, ts: ts });
      dest.postMessage({ cmd: 'incr', name: cname, value: 1, ts: ts });
      // we also record the same measurement in our control instance:
      control.histogram(hname, dp, ts);
      control.incr(cname, 1, ts);

      MEASUREMENTS.push([workerIndex, 'h', hname, dp, ts]);
      MEASUREMENTS.push([workerIndex, 'c', cname, 1, ts]);

      if (Math.random() > 0.7) {
        await sleep(_.random(1, 2));
      }
    }
  } else {
    console.log('******** Using pre-recorded data file');
    const data = JSON.parse(
      fs.readFileSync(process.env.FROM_DATA_FILE, 'utf8')
    );
    for (const inputData of data) {
      const [workerIndex, metricType, metricName, metricValue, ts] = inputData;

      const dest = workers.filter((w) => w.threadId === workerIndex + 1)[0];

      if (metricType === 'h') {
        dest.postMessage({
          cmd: 'histogram',
          name: metricName,
          value: metricValue,
          ts: ts
        });
        control.histogram(metricName, metricValue, ts);
      } else if (metricType === 'c') {
        dest.postMessage({
          cmd: 'incr',
          name: metricName,
          value: metricValue,
          ts: ts
        });
        control.incr(metricName, metricValue, ts);
      }
    }
  }

  await sleep(1000);

  for (const worker of workers) {
    worker.postMessage({ cmd: 'exit' });
  }

  // Wait for all workers to exit
  while (true) {
    await sleep(500);
    if (workersRunning === 0) {
      break;
    }
  }

  control.aggregate(true);
  control.stop();

  // Now we can compare:

  for (const [bucket, summaries] of Object.entries(metricData)) {
    t.comment(
      `number of summaries in bucket: ${bucket} -> ${summaries.length}}`
    );
    t.ok(
      summaries.length >= 1,
      'Should have a summary from at least one worker for each bucket'
    );
  }

  t.ok(
    _.isEqual(Object.keys(metricData).sort(), control.getBucketIds().sort()),
    'Should have the same set of buckets'
  );
  console.log(Object.keys(metricData).sort(), control.getBucketIds().sort());

  const combined = {};
  for (const [bucket, summaries] of Object.entries(metricData)) {
    // summaries = list of metrics objects for a period/bucket from every worker

    // these are histogram names tracked in this period (across all workers):
    const histogramNames = [
      ...new Set(
        summaries.reduce((acc, m) => {
          acc = acc.concat(Object.keys(m.histograms));
          return acc;
        }, [])
      )
    ];
    const histogramMax = {};
    for (const hn of histogramNames) {
      for (const m of summaries) {
        if (m.histograms[hn]) {
          if (m.histograms[hn].max > (histogramMax[hn] || 0)) {
            histogramMax[hn] = m.histograms[hn].max;
          }
        }
      }
    }

    const merged = SSMS.mergeBuckets(summaries);

    combined[Object.keys(merged)[0]] = merged[Object.keys(merged)[0]]; // we only expect merged object to have one key

    const m = combined[Object.keys(merged)[0]];
    for (const [h, v] of Object.entries(m.histograms)) {
      t.ok(
        v.max === histogramMax[h],
        `max value on merged object equals to largest max value of a constituent metric object (${v.max} = ${histogramMax[h]})`
      );
    }
  }

  // This is only one bucket - the very first one:
  const packed = SSMS.pack(metricData[Object.keys(metricData)[0]]);

  //
  // Compare aggregated metrics with those recorded in the "control" SSMS instance
  //
  for (const [bucketId, summary] of Object.entries(combined)) {
    t.comment(`bucketId: ${bucketId}, typeof = ${typeof bucketId}`);
    const controlSummary = control.getMetrics(bucketId);

    t.ok(
      _.isEqual(summary.counters, controlSummary.counters),
      'Aggregated counter values should be the same'
    );

    for (const [hname, h] of Object.entries(summary.histograms)) {
      t.comment(`histogram: ${hname}`);
      t.ok(
        h.min === controlSummary.histograms[hname].min,
        'min values should be equal'
      );
      console.log('h p99 =====>', round(h.getValueAtQuantile(0.99), 1));
      console.log(
        'control p99 ======>',
        round(controlSummary.histograms[hname].getValueAtQuantile(0.99), 1)
      );
      t.ok(
        round(h.getValueAtQuantile(0.99), 1) ===
          round(controlSummary.histograms[hname].getValueAtQuantile(0.99), 1),
        'p99 values should be equal'
      );
      t.ok(
        h.count === controlSummary.histograms[hname].count,
        'count values should be equal'
      );
      t.ok(h.max > h.getValueAtQuantile(0.99), 'max is > p99');
      t.ok(h.max > h.getValueAtQuantile(0.95), 'max is > p95');
      t.ok(
        h.min > 0 && h.max > 0 && h.getValueAtQuantile(0.99) > 0,
        'All aggregations are > 0'
      );
    }

    for (const [hname, h] of Object.entries(packed.histograms)) {
      t.ok(
        h.max > h.getValueAtQuantile(0.99),
        `${hname} summary max is > p99 (${h.max} > ${h.getValueAtQuantile(
          0.99
        )})`
      );
      t.ok(
        h.min > 0 && h.max > 0 && h.getValueAtQuantile(0.99) > 0,
        `summary aggregations are > 0 (${hname} - ${h.min}, ${
          h.max
        }, ${h.getValueAtQuantile(0.99)})`
      );
    }

    // TODO: Add rates

    // Metadata:
    t.comment(
      'period comparison: summary ->',
      summary.period,
      typeof summary.period,
      'controlSummary ->',
      controlSummary.period,
      typeof controlSummary.period
    );
    t.ok(
      summary.period === controlSummary.period,
      'bucket id should be the same'
    );
    t.ok(
      summary.lastMetricAt === controlSummary.lastMetricAt,
      'lastMetricAt should be equal'
    );
    t.ok(
      summary.lastCounterAt === controlSummary.lastCounterAt,
      'lastCounterAt should be equal'
    );
    t.ok(
      summary.firstHistogramAt === controlSummary.firstHistogramAt,
      'firstHistogramAt should be equal'
    );
  }
});

tap.test('Metric aggregation - merged histograms', async (t) => {
  const control = new SSMS({ pullOnly: true });
  const metricData = {}; // indexed by timestamp (as string) -> [summaries]

  const NUM_WORKERS = 7;
  const workers = [];
  let workersRunning = 0;

  for (let i = 0; i < NUM_WORKERS; i++) {
    const worker = new Worker(path.resolve(__dirname, 'ssms-worker.js'));

    workers.push(worker);
    workersRunning++;

    worker.on('message', (message) => {
      if (message.event === 'metricData') {
        const md = SSMS.deserializeMetrics(message.metricData);
        md.metadata = { workerId: message.workerId };
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

  for (const inputData of responseTimeHistogramsData) {
    const [workerIndex, , metricName, metricValue, ts] = inputData;
    const [dest] = workers.filter((w, idx) => idx === workerIndex);

    dest.postMessage({
      cmd: 'histogram',
      name: metricName,
      value: metricValue,
      ts: ts
    });
    control.histogram(metricName, metricValue, ts);
  }

  await sleep(1000);

  for (const worker of workers) {
    worker.postMessage({ cmd: 'exit' });
  }

  // Wait for all workers to exit
  while (true) {
    await sleep(500);
    if (workersRunning === 0) {
      break;
    }
  }

  control.aggregate(true);
  control.stop();

  // Now we can compare:

  t.ok(
    _.isEqual(Object.keys(metricData).sort(), control.getBucketIds().sort()),
    'Should have the same set of buckets'
  );

  const combined = {};
  for (const [bucket, summaries] of Object.entries(metricData)) {
    // summaries = list of metrics objects for a period/bucket from every worker
    // these are histogram names tracked in this period (across all workers):
    const histogramNames = [
      ...new Set(
        summaries.reduce((acc, m) => {
          acc = acc.concat(Object.keys(m.histograms));
          return acc;
        }, [])
      )
    ];
    const histogramMax = {};
    for (const hn of histogramNames) {
      for (const m of summaries) {
        if (m.histograms[hn]) {
          if (m.histograms[hn].max > (histogramMax[hn] || 0)) {
            histogramMax[hn] = m.histograms[hn].max;
          }
        }
      }
    }

    const merged = SSMS.mergeBuckets(summaries);

    combined[Object.keys(merged)[0]] = merged[Object.keys(merged)[0]]; // we only expect merged object to have one key
  }

  // This is only one bucket - the very first one:
  const packed = SSMS.pack(metricData[Object.keys(metricData)[0]]);

  //
  // Compare aggregated metrics with those recorded in the "control" SSMS instance
  //
  for (const [bucketId, summary] of Object.entries(combined)) {
    t.comment(`bucketId: ${bucketId}, typeof = ${typeof bucketId}`);
    const controlSummary = control.getMetrics(bucketId);

    // TODO fix
    // t.ok(_.isEqual(summary.counters, controlSummary.counters), 'Aggregated counter values should be the same');

    for (const [hname, h] of Object.entries(summary.histograms)) {
      t.comment(`histogram: ${hname}`);
      console.log('h p99 =====>', round(h.getValueAtQuantile(0.99), 1));
      console.log(
        'control p99 ======>',
        round(controlSummary.histograms[hname].getValueAtQuantile(0.99), 1)
      );
      t.ok(
        round(h.getValueAtQuantile(0.99), 1) ===
          round(controlSummary.histograms[hname].getValueAtQuantile(0.99), 1),
        'p99 values should be equal'
      );
      t.ok(h.max > h.getValueAtQuantile(0.99), 'max is > p99');
      t.ok(h.max > h.getValueAtQuantile(0.95), 'max is > p95');
      // TODO fix
      // t.ok(h.min > 0 && h.max > 0 && h.getValueAtQuantile(0.99) > 0, 'All aggregations are > 0');
    }

    for (const [hname, h] of Object.entries(packed.histograms)) {
      t.ok(
        h.max > h.getValueAtQuantile(0.99),
        `${hname} summary max is > p99 (${h.max} > ${h.getValueAtQuantile(
          0.99
        )})`
      );
      // TODO fix
      // t.ok(h.min > 0 && h.max > 0 && h.getValueAtQuantile(0.99) > 0, `summary aggregations are > 0 (${hname} - ${h.min}, ${h.max}, ${h.getValueAtQuantile(0.99)})`);
    }

    // Metadata:
    t.comment(
      'period comparison: summary ->',
      summary.period,
      typeof summary.period,
      'controlSummary ->',
      controlSummary.period,
      typeof controlSummary.period
    );
    // TODO fix
    // t.ok(summary.firstHistogramAt === controlSummary.firstHistogramAt, 'firstHistogramAt should be equal');
  }
});

function round(number, decimals) {
  const m = 10 ** decimals;
  return Math.round(number * m) / m;
}
