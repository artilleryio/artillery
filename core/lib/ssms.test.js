const test = require('ava');

const data = require('../../test/data/geometric.json');

const debug = require('debug')('ssms.test');
const { setDriftlessInterval, clearDriftless } = require('driftless');
const { SSMS } = require('./ssms');
const _ = require('lodash');

/*
  Push the same data points into one SSMS instances and into several SSMS instances.
  Combine those separate SSMS instances and check that the totals equal, i.e.
  there should be no difference between recording the same data stream in one instance,
  vs it being collected in multiple places and then merged back.
*/

test('aggregating metrics collected in multiple places', async t => {
  t.timeout(60 * 1000);

  const m = new SSMS();
  const ms = [0, 1, 2, 3, 4].map(_ => new SSMS());

  const DURATION_SEC = 23;
  const dps = data[0];
  const tickMs = Math.floor(DURATION_SEC * 1000 / dps.length);
  debug(`Duration = ${DURATION_SEC}s // tick = ${tickMs}ms`);

  // Metric summaries emitted by SSMS instances, indexed by timeslice:
  const splitMetrics = {};
  const singleStreamMetrics = {};

  m.on('metricData', (ts, data) => {
    singleStreamMetrics[ts] = data;
  });

  function combineByTs(ts, data) {
    if(splitMetrics[ts]) {
      splitMetrics[ts].push(data);
    } else {
      splitMetrics[ts] = [data];
    }
  }

  ms.forEach(m => m.on('metricData', combineByTs));

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

  function writeValues() {
    return new Promise((resolve, reject) => {
      let i = 0;
      const interval = setDriftlessInterval(() => {
        if (i >= dps.length) {
          clearDriftless(interval);
          return resolve();
        }

        // setting an explicit timestamp avoids timing-related failures when
        // tests are run, when the same value is written on either side of a
        // timeslice boundary
        const t = Date.now();

        const histoName = _.sample(histogramNames);
        const counterName = _.sample(counterNames);
        const rateName = _.sample(rateNames);

        m.histogram(histoName, dps[i], t);
        m.incr(counterName, i, t);
        m.rate(rateName, t);

        const dest = _.sample(ms);
        dest.histogram(histoName, dps[i], t);
        dest.incr(counterName, i, t);
        dest.rate(rateName, t);

        i++;
      }, tickMs);
    });
  }

  await writeValues();

  ms.forEach(m => m.aggregate(true));
  m.aggregate(true);

  const mergedMetrics = {};
  for(const [ts, data] of Object.entries(splitMetrics)) {
    // FIX: array property becomes an object here; init a new variable for holding merged data instead
    splitMetrics[ts] = SSMS.mergePeriods(data)[ts];
  }

  t.assert(_.isEqual(Object.keys(singleStreamMetrics).sort(), Object.keys(splitMetrics).sort()), 'Same timeslices have been aggregated');

  for(const [ts, metrics] of Object.entries(singleStreamMetrics)) {
    t.assert(_.isEqual(Object.keys(metrics.histograms).sort(), Object.keys(splitMetrics[ts].histograms).sort()), 'Same histogram metrics have been recorded');
    t.assert(_.isEqual(Object.keys(metrics.counters).sort(), Object.keys(splitMetrics[ts].counters).sort()), 'Same counter metrics have been recorded');
    t.assert(_.isEqual(Object.keys(metrics.rates).sort(), Object.keys(splitMetrics[ts].rates).sort()), 'Same rate metrics have been recorded');

    for(const histName of Object.keys(metrics.histograms)) {
      ['count', 'min', 'max', 'p50', 'p99'].forEach((x) => {
        t.assert(metrics.histograms[histName][x] === splitMetrics[ts].histograms[histName][x], `${x} of the metric is the same`);
      });
    }
    for (const counterName of Object.keys(metrics.counters)) {
      t.assert(metrics.counters[counterName] === splitMetrics[ts].counters[counterName], 'counter value is the same');
    }
    for (const rateName of Object.keys(metrics.rates)) {
      t.assert(metrics.counters[rateName] === splitMetrics[ts].counters[rateName], 'rate value is the same');
    }
  }

  t.pass();
});

test('serialize/deserialize', async t => {
  t.timeout(60 * 1000);
  // Check that period data can be serialized and deserialized back into a proper object
  // console.log(SSMS.deserializePeriodJSON(m.serializePeriodJSON(ts)));
  t.pass();
});

test('timeslice operations', async t => {
  t.timeout(60 * 1000);
  t.pass();
});