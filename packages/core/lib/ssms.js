/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Super simple metric store

// Use our own fork of DDSketch until this PR is merged into main:
// https://github.com/DataDog/sketches-js/pull/13
const { DDSketch } = require('@artilleryio/sketches-js');
// const {DDSketch} = require('@datadog/sketches-js');
const EventEmitter = require('events');
const { setDriftlessInterval, clearDriftless } = require('driftless');
const debug = require('debug')('ssms');

class SSMS extends EventEmitter {
  constructor(_options) {
    super();

    this.opts = _options || {};

    this._counterEarliestMeasurementByPeriod = {};
    this._counterLastMeasurementByPeriod = {};
    this._histogramEarliestMeasurementByPeriod = {};
    this._histogramLastMeasurementByPeriod = {};

    this._aggregationIntervalSec = 5;
    this._aggregateInterval = setDriftlessInterval(
      this.aggregate.bind(this),
      this._aggregationIntervalSec * 1000
    );

    this._lastPeriod = null;

    this.isPullOnly = this.opts.pullOnly;

    if (!this.isPullOnly) {
      this._emitInterval = setDriftlessInterval(
        this._maybeEmitMostRecentPeriod.bind(this),
        Math.max((this._aggregationIntervalSec * 1000) / 2, 1000)
      );
    }

    this._counters = [];
    this._histograms = [];
    this._rates = [];

    this._active = true;

    this._aggregatedCounters = {};
    this._aggregatedHistograms = {};
    this._aggregatedRates = {};
  }

  stop() {
    this._active = false;
    clearDriftless(this._aggregateInterval);

    if (!this.isPullOnly) {
      clearDriftless(this._emitInterval);
    }

    return this;
  }

  static report(pds) {
    return pds;
  }

  // TODO: first/last metric timestamps should not = period
  static empty(ts) {
    const period = normalizeTs(ts || Date.now());
    return {
      counters: {},
      histograms: {},
      rates: {},
      firstCounterAt: 0,
      firstHistogramAt: 0,
      lastCounterAt: 0,
      lastHistogramAt: 0,
      firstMetricAt: 0,
      lastMetricAt: 0,
      period
    };
  }

  static summarizeHistogram(h) {
    return summarizeHistogram(h);
  }

  // Take metric data for a period and return a summary object with 1.6.x-compatible format
  static legacyReport(pd) {
    const result = {
      // Custom field compatibility not supported:
      customStats: {},
      counters: {},

      scenariosAvoided: pd.counters['vusers.skipped'] || 0,
      timestamp: new Date(pd.period),
      scenariosCreated: pd.counters['vusers.created'] || 0,
      scenariosCompleted: pd.counters['vusers.completed'] || 0,

      requestsCompleted:
        pd.counters['http.responses'] ||
        pd.counters['socketio.emit'] ||
        pd.counters['websocket.messages_sent'] ||
        0,
      latency: {},
      rps: {
        mean: pd.rates
          ? pd.rates['http.response_rate'] ||
            pd.rates['socketio.emit_rate'] ||
            0
          : 0,
        count:
          pd.counters['http.responses'] || pd.counters['socketio.emit'] || 0
      },
      scenarioDuration: {},
      scenarioCounts: {},

      errors: {},
      codes: {}
    };

    if (
      pd.histograms &&
      typeof pd.histograms['vusers.session_length'] !== 'undefined'
    ) {
      result.scenarioDuration = summarizeHistogram(
        pd.histograms['vusers.session_length']
      );
    }

    // scenarioCounts
    const names = Object.keys(pd.counters).filter((k) =>
      k.startsWith('vusers.created_by_name.')
    );
    for (const n of names) {
      result.scenarioCounts[n.split('vusers.created_by_name.')[1]] =
        pd.counters[n];
    }

    // latency
    const latencyh = pd.histograms
      ? pd.histograms['http.response_time'] ||
        pd.histograms['socketio.response_time']
      : null;
    if (latencyh) {
      result.latency = summarizeHistogram(latencyh);
    }

    // HTTP codes
    const codeNames = Object.keys(pd.counters).filter((k) =>
      k.match(/^(http|socketio)\.codes.*/)
    );
    for (const n of codeNames) {
      const code = parseInt(n.split('.codes.')[1]);
      result.codes[code] = pd.counters[n];
    }

    // errors
    const errNames = Object.keys(pd.counters).filter((k) =>
      k.startsWith('errors.')
    );
    for (const n of errNames) {
      const errName = n.split('errors.')[1];
      result.errors[errName] = pd.counters[n];
    }

    return {
      report: function () {
        return result;
      }
    };
  }

  // Return object indexed by period (as string):
  static mergeBuckets(periodData) {
    debug(`mergeBuckets // timeslices: ${periodData.map((pd) => pd.period)}`);

    // Returns result[timestamp] = {histograms:{},counters:{},rates:{}}
    // ie. the result is indexed by timeslice
    const result = {};

    for (const pd of periodData) {
      const ts = pd.period;

      if (!result[ts]) {
        result[ts] = {
          counters: {},
          histograms: {},
          rates: {}
        };
      }

      pd.counters = pd.counters || {};
      pd.histograms = pd.histograms || {};
      pd.rates = pd.rates || {};

      //
      // counters
      //
      for (const [name, value] of Object.entries(pd.counters)) {
        if (!result[ts].counters[name]) {
          result[ts].counters[name] = 0;
        }

        result[ts].counters[name] += value;
      }

      //
      // histograms
      //
      for (const [name, origValue] of Object.entries(pd.histograms)) {
        const value = SSMS.cloneHistogram(origValue);
        if (typeof result[ts].histograms[name] === 'undefined') {
          result[ts].histograms[name] = value;
        } else {
          // NOTE: this will throw if gamma (accuracy) parameters are different
          // in those two sketches
          result[ts].histograms[name].merge(value);
        }
      }

      //
      // rates
      //
      for (const [name, value] of Object.entries(pd.rates)) {
        if (typeof result[ts].rates[name] === 'undefined') {
          result[ts].rates[name] = 0;
        }

        result[ts].rates[name] += value;
      }

      for (const name of Object.keys(pd.rates)) {
        result[ts][name] = round(result[ts][name] / periodData.length, 1);
      }

      result[ts].firstCounterAt = min([
        result[ts].firstCounterAt,
        pd.firstCounterAt
      ]);
      result[ts].firstHistogramAt = min([
        result[ts].firstHistogramAt,
        pd.firstHistogramAt
      ]);
      result[ts].lastCounterAt = max([
        result[ts].lastCounterAt,
        pd.lastCounterAt
      ]);
      result[ts].lastHistogramAt = max([
        result[ts].lastHistogramAt,
        pd.lastHistogramAt
      ]);

      result[ts].firstMetricAt = min([
        result[ts].firstHistogramAt,
        result[ts].firstCounterAt
      ]);
      result[ts].lastMetricAt = max([
        result[ts].lastHistogramAt,
        result[ts].lastCounterAt
      ]);
      result[ts].period = ts;
    }

    return result;
  }

  // Aggregate at lower resolution, i.e. combine three distinct periods of 10s into one of 30s
  // Note: does not check that periods are contiguous, everything is simply merged together
  static pack(periods) {
    const result = {
      counters: {},
      histograms: {},
      rates: {}
    };

    for (const pd of periods) {
      pd.counters = Object.assign({}, pd.counters || {});
      pd.histograms = Object.assign({}, pd.histograms || {});
      pd.rates = Object.assign({}, pd.rates || {});

      for (const [name, value] of Object.entries(pd.counters)) {
        if (!result.counters[name]) {
          result.counters[name] = 0;
        }

        result.counters[name] += value;
      }

      for (const [name, origValue] of Object.entries(pd.histograms)) {
        const value = SSMS.cloneHistogram(origValue);
        if (typeof result.histograms[name] === 'undefined') {
          result.histograms[name] = value;
        } else {
          // NOTE: this will throw if gamma (accuracy) parameters are different
          // in those two sketches
          result.histograms[name].merge(value);
        }
      }

      for (const [name, value] of Object.entries(pd.rates)) {
        if (!result.rates[name]) {
          result.rates[name] = 0;
        }

        // TODO: retain first/last so that we have the duration
        // or retain the duration of the window in which rate events
        // were recorded alongside the average value
        result.rates[name] += value;
      }
    }

    for (const [name, _value] of Object.entries(result.rates)) {
      result.rates[name] = round(result.rates[name] / periods.length, 0);
    }

    result.firstCounterAt = min(periods.map((p) => p.firstCounterAt));
    result.firstHistogramAt = min(periods.map((p) => p.firstHistogramAt));
    result.lastCounterAt = max(periods.map((p) => p.lastCounterAt));
    result.lastHistogramAt = max(periods.map((p) => p.lastHistogramAt));

    result.firstMetricAt = min([
      result.firstHistogramAt,
      result.firstCounterAt
    ]);
    result.lastMetricAt = max([result.lastHistogramAt, result.lastCounterAt]);

    result.period = max(periods.map((p) => p.period));
    return result;
  }

  static cloneHistogram(h) {
    return DDSketch.fromProto(h.toProto());
  }

  static serializeMetrics(pd) {
    // TODO: Add ability to include arbitrary metadata e.g. worker IDs
    const serializedHistograms = {};
    const ph = pd.histograms;
    if (ph) {
      for (const n of Object.keys(ph)) {
        const h = ph[n];
        const buf = h.toProto();
        serializedHistograms[n] = buf;
      }
    }

    // TODO: Mark as serialized, otherwise to check whether we have a serialized object or not
    // is to check if .histograms is a Buffer
    const result = Object.assign({}, pd, { histograms: serializedHistograms });
    return stringify(result);
  }

  static deserializeMetrics(pd) {
    const object = parse(pd);
    for (const [name, buf] of Object.entries(object.histograms)) {
      const h = DDSketch.fromProto(buf);
      object.histograms[name] = h;
    }

    object.period = object.period;

    return object;
  }

  getBucketIds() {
    return [
      ...new Set(
        Object.keys(this._aggregatedCounters)
          .concat(Object.keys(this._aggregatedHistograms))
          .sort()
      )
    ].reverse();
  }

  // TODO: Deprecate
  counter(name, value) {
    this.incr(name, value);
  }

  incr(name, value, t) {
    this._counters.push(t || Date.now(), name, value);
  }

  // TODO: Deprecate
  summary(name, value) {
    this.histogram(name, value);
  }

  histogram(name, value, t) {
    this._histograms.push(t || Date.now(), name, value);
  }

  rate(name, t) {
    this._rates.push(t || Date.now(), name);
  }

  getMetrics(period) {
    const result = {};

    const counters = this._aggregatedCounters[period];
    const histograms = this._aggregatedHistograms[period];
    const rates = this._aggregatedRates[period];

    if (counters) {
      result.counters = counters;
    }

    if (histograms) {
      result.histograms = histograms;
    }

    if (rates) {
      result.rates = rates;
    }

    result.period = period;
    result.firstCounterAt = this._counterEarliestMeasurementByPeriod[period];
    result.firstHistogramAt =
      this._histogramEarliestMeasurementByPeriod[period];

    result.lastCounterAt = this._counterLastMeasurementByPeriod[period];
    result.lastHistogramAt = this._histogramLastMeasurementByPeriod[period];

    result.firstMetricAt = min([
      result.firstHistogramAt,
      result.firstCounterAt
    ]);
    result.lastMetricAt = max([result.lastHistogramAt, result.lastCounterAt]);

    // TODO: Include size of the window, for cases when it's not 10s

    return result;
  }

  _aggregateHistograms(upToTimeslice) {
    for (let i = 0; i < this._histograms.length; i += 3) {
      const ts = this._histograms[i];
      const timeslice = normalizeTs(ts);

      if (timeslice >= upToTimeslice) {
        this._histograms.splice(0, i);
        return;
      }

      const name = this._histograms[i + 1];
      const value = this._histograms[i + 2];

      if (!this._aggregatedHistograms[timeslice]) {
        this._aggregatedHistograms[timeslice] = {};
        this._histogramEarliestMeasurementByPeriod[timeslice] = ts;
      }

      if (!this._aggregatedHistograms[timeslice][name]) {
        this._aggregatedHistograms[timeslice][name] = new DDSketch({
          relativeAccuracy: 0.01
        });
      }

      // TODO: Benchmark
      this._histogramLastMeasurementByPeriod[timeslice] = ts;

      this._aggregatedHistograms[timeslice][name].accept(value);
    }

    this._histograms.splice(0, this._histograms.length);
  }

  _aggregateCounters(upToTimeslice) {
    // Consider memory-CPU tradeoff. Depending on the length of the buffer, we may want to
    // not exceed N total entries we're processing if we can delay reporting by one or more
    // reporting periods

    for (let i = 0; i < this._counters.length; i += 3) {
      const ts = this._counters[i];
      const timeslice = normalizeTs(ts);

      if (timeslice >= upToTimeslice) {
        this._counters.splice(0, i);
        return;
      }

      const name = this._counters[i + 1];
      const value = this._counters[i + 2];

      if (!this._aggregatedCounters[timeslice]) {
        this._aggregatedCounters[timeslice] = {};
        this._counterEarliestMeasurementByPeriod[timeslice] = ts;
      }

      if (typeof this._aggregatedCounters[timeslice][name] === 'undefined') {
        this._aggregatedCounters[timeslice][name] = value;
      } else {
        this._aggregatedCounters[timeslice][name] += value;
      }

      this._counterLastMeasurementByPeriod[timeslice] = ts;
    }

    this._counters.splice(0, this._counters.length);
  }

  _aggregateRates(upToTimeslice) {
    debug('_aggregateRates to', upToTimeslice, new Date(upToTimeslice));

    const a = {};
    let spliceTo = this._rates.length;

    for (let i = 0; i < this._rates.length; i += 2) {
      const ts = this._rates[i];
      const timeslice = normalizeTs(ts);

      if (timeslice >= upToTimeslice) {
        debug(
          '_aggregateRates early return // i=',
          i,
          'timeslice=',
          timeslice,
          new Date(timeslice)
        );
        spliceTo = i;
        break;
      }

      const name = this._rates[i + 1];
      if (!a[timeslice]) {
        a[timeslice] = {};
      }

      if (!a[timeslice][name]) {
        a[timeslice][name] = {
          first: Number.POSITIVE_INFINITY,
          last: 0,
          count: 0
        };
      }

      a[timeslice][name].first = Math.min(a[timeslice][name].first, ts);
      a[timeslice][name].last = Math.max(a[timeslice][name].last, ts);
      a[timeslice][name].count++;
    }

    for (const [ts, rs] of Object.entries(a)) {
      for (const [name, _] of Object.entries(rs)) {
        const { first, last, count } = a[ts][name];
        if (!this._aggregatedRates[ts]) {
          this._aggregatedRates[ts] = {};
        }

        this._aggregatedRates[ts][name] = round(
          count / (Math.max(last - first, 1000) / 1000),
          0
        );
      }
    }

    this._rates.splice(0, spliceTo);
  }

  aggregate(forceAll) {
    const currentTimeslice =
      normalizeTs(Date.now()) + (forceAll ? 30 * 1000 : 0);

    this._aggregateCounters(currentTimeslice);
    this._aggregateHistograms(currentTimeslice);
    this._aggregateRates(currentTimeslice);

    if (forceAll) {
      this._emitPeriods();
    } else {
      this._maybeEmitMostRecentPeriod();
    }
  }

  _emitPeriods() {
    const bucketIds = this.getBucketIds();
    const lastPeriod = parseInt(this._lastPeriod, 10);

    for (let i = 0; i < bucketIds.length; i++) {
      const period = bucketIds[i];

      if (!this._lastPeriod || parseInt(period, 10) > lastPeriod) {
        this.emit('metricData', period, this.getMetrics(period));
      }
    }
  }

  _maybeEmitMostRecentPeriod() {
    const p = this.getBucketIds()[0];

    if (p && p !== this._lastPeriod) {
      this.emit('metricData', p, this.getMetrics(p)); // Measurements in period p have been aggregated
      this._lastPeriod = p;
    }
  }
}

function normalizeTs(epochMs, windowSize = 10) {
  // Reset down to minute
  const m = Math.floor((epochMs - (epochMs % 1000)) / 1000 / 60) * 60 * 1000;
  // Number of seconds past the minute
  const s = ((epochMs - (epochMs % 1000)) / 1000) % 60;
  // Number of seconds to take off
  const d = s % windowSize;
  return m + (s - d) * 1000;
}

// Function hms(epochMs) {
//   return [
//     Math.round((epochMs / 1000 / 60 / 60) % 24),
//     Math.round((epochMs / 1000 / 60) % 60),
//     Math.round(epochMs / 1000) % 60
//   ];
// }

function round(number, decimals) {
  const m = 10 ** decimals;
  return Math.round(number * m) / m;
}

// h is an instance of DDSketch
function summarizeHistogram(h) {
  return {
    min: round(h.min, 1),
    max: round(h.max, 1),
    count: h.count,
    mean: round(h.sum/h.count, 1),
    p50: round(h.getValueAtQuantile(0.5), 1),
    median: round(h.getValueAtQuantile(0.5), 1), // Here for compatibility
    p75: round(h.getValueAtQuantile(0.75), 1),
    p90: round(h.getValueAtQuantile(0.9), 1),
    p95: round(h.getValueAtQuantile(0.95), 1),
    p99: round(h.getValueAtQuantile(0.99), 1),
    p999: round(h.getValueAtQuantile(0.999), 1)
  };
}

/// ///////////////////////////////////////////
function stringify(value, space) {
  return JSON.stringify(value, replacer, space);
}

function parse(text) {
  return JSON.parse(text, reviver);
}

function replacer(key, value) {
  if (isBufferLike(value) && isArray(value.data)) {
    if (value.data.length > 0) {
      value.data = 'base64:' + Buffer.from(value.data).toString('base64');
    } else {
      value.data = '';
    }
  }

  return value;
}

function reviver(key, value) {
  if (isBufferLike(value)) {
    if (isArray(value.data)) {
      return Buffer.from(value.data);
    }

    if (isString(value.data)) {
      if (value.data.startsWith('base64:')) {
        return Buffer.from(value.data.slice('base64:'.length), 'base64');
      }

      // Assume that the string is UTF-8 encoded (or empty).
      return Buffer.from(value.data);
    }
  }

  return value;
}

function isBufferLike(x) {
  return (
    isObject(x) && x.type === 'Buffer' && (isArray(x.data) || isString(x.data))
  );
}

function isArray(x) {
  return Array.isArray(x);
}

function isString(x) {
  return typeof x === 'string';
}

function isObject(x) {
  return typeof x === 'object' && x !== null;
}
/// /////////////////

// Like Math.min and Math.max but take a list of values, and ignore
// undefined's rather than returning NaN when a value is undefined.
// Returns undefined if all arguments are undefined.
function min(values) {
  const m = Math.min(...values.filter((x) => x));
  return m === Number.POSITIVE_INFINITY ? undefined : m;
}

function max(values) {
  const m = Math.max(...values.filter((x) => x));
  return m === Number.NEGATIVE_INFINITY ? undefined : m;
}

module.exports = {
  SSMS,
  summarizeHistogram,
  normalizeTs
};
