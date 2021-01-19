// super simple metric store

const { DDSketch } = require('@datadog/sketches-js');
const EventEmitter = require('events');
const { setDriftlessInterval, clearDriftless } = require('driftless');
const debug = require('debug')('ssms');

class SSMS extends EventEmitter {
  constructor(opts) {
    super();

    this._counterEarliestMeasurementByPeriod = {};
    this._counterLastMeasurementByPeriod = {};
    this._histogramEarliestMeasurementByPeriod = {};
    this._histogramLastMeasurementByPeriod = {};

    this._aggregationIntervalSec = 5;
    this._aggregateInterval = setDriftlessInterval(this.aggregate.bind(this), this._aggregationIntervalSec * 1000);

    this._lastPeriod = null;
    this._emitInterval = setDriftlessInterval(
      this._maybeEmitMostRecentPeriod.bind(this),
      Math.max(this._aggregationIntervalSec * 1000 / 2, 1000));


    this._counters = [];
    this._histograms = [];
    this._rates = [];

    this._aggregatedCounters = {};
    this._aggregatedHistograms = {};
    this._aggregatedRates = {};
  }

  static mergePeriods(periodData) {
    debug(`mergePeriods // timeslices: ${periodData.map(pd => pd.period)}`);

    // Returns result[timestamp] = {histograms:{},counters:{},rates:{}}
    // ie. the result is indexed by timeslice
    const result = {
    };

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
      for(const [name, value] of Object.entries(pd.counters)) {
        if (!result[ts].counters[name]) {
          result[ts].counters[name] = 0;
        }
        result[ts].counters[name] += value;
      }

      //
      // histograms
      //
      for(const [name, value] of Object.entries(pd.histograms)) {
        if (!result[ts].histograms[name]) {
          result[ts].histograms[name] = { _raw: value._raw };
        } else {
          // NOTE: this will throw if gamma (accuracy) parameters are different
          // in those two sketches
          result[ts].histograms[name]._raw.merge(value._raw);
        }
      }
      Object.keys(result[ts].histograms).forEach((name) => {
        const value = result[ts].histograms[name];
        result[ts].histograms[name] = summarizeHistogram(value._raw);
        result[ts].histograms[name]._raw = value._raw;
      });

      //
      // rates
      //
      for(const [name, value] of Object.entries(pd.rates)) {
        if(!result[ts].rates[name]) {
          result[ts].rates[name] = 0;
        }
        result[ts].rates[name] += value;
      }
      for(const name of Object.keys(pd.rates)) {
        result[ts][name] = round(result[ts][name] / periodData.length, 1);
      }

      result[ts].firstCounterAt = min([result[ts].firstCounterAt, pd.firstCounterAt]);
      result[ts].firstHistogramAt = min([result[ts].firstHistogramAt, pd.firstHistogramAt]);
      result[ts].lastCounterAt = max([result[ts].lastCounterAt, pd.lastCounterAt]);
      result[ts].lastHistogramAt = max([result[ts].firstHistogramAt, pd.lastHistogramAt]);

      result[ts].firstMetricAt = min([result[ts].firstHistogramAt, result[ts].firstCounterAt]);
      result[ts].lastMetricAt = max([result[ts].lastHistogramAt, result[ts].lastCounterAt]);
      result[ts].period = ts;
    }

    return result;
  }

  // Aggregate at lower resolution, i.e. combine three periods of 10s into one of 30s
  // Note: does not check that periods are contiguous, everything is simply merged together.
  static zoomOut(periods) {
    const result = {
      counters: {},
      histograms: {},
      rates: {},
    };

    for (const pd of periods) {
      pd.counters = pd.counters || {};
      pd.histograms = pd.histograms || {};
      pd.rates = pd.rates || {};

      for(const [name, value] of Object.entries(pd.counters)) {
        if (!result.counters[name]) {
          result.counters[name] = 0;
        }
        result.counters[name] += value;
      }

      for(const [name, value] of Object.entries(pd.histograms)) {
        if (!result.histograms[name]) {
          result.histograms[name] = value._raw;
        } else {
          // NOTE: this will throw if gamma (accuracy) parameters are different
          // in those two sketches
          result.histograms[name].merge(value._raw);
        }
      }

      for(const [name, value] of Object.entries(pd.rates)) {
        if(!result.rates[name]) {
          result.rates[name] = 0;
        }
        // TODO: retain first/last so that we have the duration
        // or retain the duration of the window in which rate events
        // were recorded alongside the average value
        result.rates[name] += value;
      }
    }

    // Summarize histograms:
    for(const [name, value] of Object.entries(result.histograms)) {
      result.histograms[name] = summarizeHistogram(value);
      result.histograms[name]._raw = value;
    }
    for(const [name, value] of Object.entries(result.rates)) {
      result.rates[name] = round(result.rates[name] / periods.length, 0);
    }

    result.firstCounterAt = min(periods.map(p => p.firxstCounterAt));
    result.firstHistogramAt = min(periods.map(p => p.firstHistogramAt));
    result.lastCounterAt = max(periods.map(p => p.firstCounterAt));
    result.lastHistogramAt = max(periods.map(p => p.firstHistogramAt));

    result.firstMetricAt = min([result.firstHistogramAt, result.firstCounterAt]);
    result.lastMetricAt = max([result.lastHistogramAt, result.lastCounterAt]);

    result.period = max(periods.map(p => p.period));

    return result;
  }

  static serializePeriodJSON(pd) {
    // TODO: Add ability to include arbitrary metadata e.g. worker IDs
	  const serializedHistograms = {};
    const ph = pd.histograms;
    if (ph) {
	    for(const n of Object.keys(ph)) {
	        const h = ph[n];
	        const buf = h._raw.toProto();
	        serializedHistograms[n] = buf;
	    }
    }

    // TODO: Mark as serialized, otherwise to check whether we have a serialized object or not
    // is to check if .histograms is a Buffer
  	const result = Object.assign(pd, {histograms: serializedHistograms});
	  return stringify(result);
  }

  static deserializePeriodJSON(pd) {
      const obj = parse(pd);
      for (const [name, buf] of Object.entries(obj.histograms)) {
	      // FIXME: currently summary stats are lost, see:
	      // https://github.com/DataDog/sketches-js/blob/master/src/ddsketch/DDSketch.ts#L200
	      const h = DDSketch.fromProto(buf);
	      obj.histograms[name] = summarizeHistogram(h);
	      obj.histograms[name]._raw = h;
      }
      return obj;
  }

  getPeriods() {
    return [...new Set(Object.keys(this._aggregatedCounters).concat(Object.keys(this._aggregatedHistograms)).sort())].map(Number).reverse();
  }

  // TODO: Deprecate
  counter(name, val) {
    this.incr(name, val);
  }

  incr(name, val, t) {
    this._counters.push(t || Date.now(), name, val);
  }

  // TODO: Deprecate
  summary(name, val) {
    this.histogram(name, val);
  }

  histogram(name, val, t) {
    this._histograms.push(t || Date.now(), name, val);
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

    if(histograms) {
      result.histograms = Object.keys(histograms).reduce(
        (acc, k) => {
          const h = histograms[k];
          acc[k] = summarizeHistogram(h);
          acc[k]._raw = h;
          return acc;
        },
        {});
    }

    if (rates) {
      result.rates = rates;
    }

    result.period = period;
    result.firstCounterAt = this._counterEarliestMeasurementByPeriod[period];
    result.firstHistogramAt = this._histogramEarliestMeasurementByPeriod[period];

    result.lastCounterAt = this._counterLastMeasurementByPeriod[period];
    result.lastHistogramAt = this._histogramLastMeasurementByPeriod[period];

    result.firstMetricAt = min([result.firstHistogramAt, result.firstCounterAt]);
    result.lastMetricAt = max([result.lastHistogramAt, result.lastCounterAt]);

    // TODO: Include size of the window, for cases when it's not 10s

    return result;
  }

  _aggregateHistograms(upToTimeslice) {
    for(let i = 0; i < this._histograms.length; i += 3) {
      const ts = this._histograms[i];
      const timeslice = normalizeTs(ts);

      if (timeslice >= upToTimeslice) {
        this._histograms.splice(0, i);
        return;
      }

      const name = this._histograms[i + 1];
      const val = this._histograms[i + 2];

      if(!this._aggregatedHistograms[timeslice]) {
        this._aggregatedHistograms[timeslice] = {};
        this._histogramEarliestMeasurementByPeriod[timeslice] = ts;
      }

      if(!this._aggregatedHistograms[timeslice][name]) {
        this._aggregatedHistograms[timeslice][name] = new DDSketch({
          relativeAccuracy: 0.01
        });
      }

      // TODO: Benchmark
      this._histogramLastMeasurementByPeriod[timeslice] = ts;

      this._aggregatedHistograms[timeslice][name].accept(val);
    }

    this._histograms.splice(0, this._histograms.length);
  }

  _aggregateCounters(upToTimeslice) {
    // Consider memory-CPU tradeoff. Depending on the length of the buffer, we may want to
    // not exceed N total entries we're processing if we can delay reporting by one or more
    // reporting periods

    for(let i = 0; i < this._counters.length; i += 3) {
      const ts = this._counters[i];
      const timeslice = normalizeTs(ts);

      if (timeslice >= upToTimeslice) {
        this._counters.splice(0, i);
        return;
      }


      const name = this._counters[i + 1];
      const val = this._counters[i + 2];

      if(!this._aggregatedCounters[timeslice]) {
        this._aggregatedCounters[timeslice] = {};
        this._counterEarliestMeasurementByPeriod[timeslice] = ts;
      }

      if(!this._aggregatedCounters[timeslice][name]) {
        this._aggregatedCounters[timeslice][name] = val;
      } else {
        this._aggregatedCounters[timeslice][name] += val;
      }
      this._counterLastMeasurementByPeriod[timeslice] = ts;
    }

    this._counters.splice(0, this._counters.length);
  }

  _aggregateRates(upToTimeslice) {
    debug('_aggregateRates to', upToTimeslice, new Date(upToTimeslice));

    const a = {};
    let spliceTo = this._rates.length;

    for(let i = 0; i < this._rates.length; i += 2) {
      const ts = this._rates[i];
      const timeslice = normalizeTs(ts);

      if (timeslice >= upToTimeslice) {
        debug('_aggregateRates early return // i=', i, 'timeslice=', timeslice, new Date(timeslice));
        spliceTo = i;
        break;
      }

      const name = this._rates[i + 1];
      if (!a[timeslice]) {
        a[timeslice] = {};
      }
      if(!a[timeslice][name]) {
        a[timeslice][name] = { first: Infinity, last: 0, count: 0 };
      }

      a[timeslice][name].first = Math.min(a[timeslice][name].first, ts);
      a[timeslice][name].last = Math.max(a[timeslice][name].last, ts);
      a[timeslice][name].count++;
    }

    // This needs to run when we're exiting early too!!!
    for(const [ts, rs] of Object.entries(a)) {
      for(const [name, _] of Object.entries(rs)) {
        const { first, last, count } = a[ts][name];
        if(!this._aggregatedRates[ts]) {
          this._aggregatedRates[ts] = {};
        }
        this._aggregatedRates[ts][name] = round(count/((last - first) / 1000), 0);
      }
    }

    this._rates.splice(0, spliceTo);
  }

  aggregate(forceAll) {
    const currentTimeslice = normalizeTs(Date.now()) + (forceAll ? 100 * 1000 : 0);

    this._aggregateCounters(currentTimeslice);
    this._aggregateHistograms(currentTimeslice);
    this._aggregateRates(currentTimeslice);

    this._maybeEmitMostRecentPeriod();
  }

  _maybeEmitMostRecentPeriod() {
    const p = this.getPeriods()[0];
    if (p && p !== this._lastPeriod) {
      this.emit('metricData', p, this.getMetrics(p)); // Measurements in period p have been aggregated
      this._lastPeriod = p;
    }
  }
}

function normalizeTs(epochMs, windowSize = 10) {
  // Reset down to minute
  const m = Math.floor((epochMs - epochMs % 1000) / 1000 / 60) * 60 * 1000;
  // Number of seconds past the minute
  const s = (epochMs - epochMs%1000) / 1000 % 60;
  // Number of seconds to take off
  const d = s % windowSize;
  return m + (s-d) * 1000;
}

function hms(epochMs) {
  return [
    Math.round((epochMs/1000/60/60) % 24),
    Math.round((epochMs/1000/60) % 60),
    Math.round(epochMs/1000) % 60
  ];
}

function round(number, decimals) {
  const m = Math.pow(10, decimals);
  return Math.round(number * m) / m;
}

function summarizeHistogram(h) {
  return {
    min: round(h.min, 1),
    max: round(h.max, 1),
    count: h.count,
    p50: round(h.getValueAtQuantile(0.5), 1),
    median: round(h.getValueAtQuantile(0.5), 1), // here for compatibility
    p75: round(h.getValueAtQuantile(0.75), 1),
    p90: round(h.getValueAtQuantile(0.9), 1),
    p95: round(h.getValueAtQuantile(0.95), 1),
    p99: round(h.getValueAtQuantile(0.99), 1),
    p999: round(h.getValueAtQuantile(0.999), 1)
  };
}

//////////////////////////////////////////////
function stringify (value, space) {
  return JSON.stringify(value, replacer, space)
}

function parse (text) {
  return JSON.parse(text, reviver)
}

function replacer (key, value) {
  if (isBufferLike(value)) {
    if (isArray(value.data)) {
      if (value.data.length > 0) {
        value.data = 'base64:' + Buffer.from(value.data).toString('base64')
      } else {
        value.data = ''
      }
    }
  }
  return value
}

function reviver (key, value) {
  if (isBufferLike(value)) {
    if (isArray(value.data)) {
      return Buffer.from(value.data)
    } else if (isString(value.data)) {
      if (value.data.startsWith('base64:')) {
        return Buffer.from(value.data.slice('base64:'.length), 'base64')
      }
      // Assume that the string is UTF-8 encoded (or empty).
      return Buffer.from(value.data)
    }
  }
  return value
}

function isBufferLike (x) {
  return (
    isObject(x) && x.type === 'Buffer' && (isArray(x.data) || isString(x.data))
  )
}

function isArray (x) {
  return Array.isArray(x)
}

function isString (x) {
  return typeof x === 'string'
}

function isObject (x) {
  return typeof x === 'object' && x !== null
}
////////////////////

// Like Math.min and Math.max but take a list of values, and ignore
// undefined's rather than returning NaN when a value is undefined.
// Returns undefined if all arguments are undefined.
function min(values) {
  const m = Math.min(...(values.map(x => x)));
  return m === Infinity ? undefined : m;
}

function max(values) {
  const m = Math.max(...(values.map(x => x)));
  return m === -Infinity ? undefined : m;
}

module.exports = { SSMS };
