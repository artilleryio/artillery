/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const L = require('lodash');
const HdrHistogram = require('hdr-histogram-js');

module.exports = {
  create: create,
  combine: combine,
  round: round,
  deserialize
};

 function deserialize(serialized) {
  const o = JSON.parse(serialized);
  const histos = L.reduce(
    o.encodedHistograms,
    (acc, encodedHisto, name) => {
      acc[name] = HdrHistogram.decodeFromCompressedBase64(encodedHisto);
      return acc;
    },
    {});

  const result = create();
  result._counters = o.counters;
  result._summaries = histos;
  return result;
};


/**
 * Create a new stats object
 */
function create() {
  return new Stats();
}

/**
 * Combine several stats objects from different workers into one
 */
function combine(statsObjects) {
  let result = create();

  L.each(statsObjects, function(stats) {
    L.each(stats._counters, function(value, name) {
      if (!result._counters[name]) {
        result._counters[name] = 0;
      }
      result._counters[name] += value;
    });

    L.each(stats._summaries, (histo, name) => {
      if(!result._summaries[name]) {
        // TODO: DRY
        result._summaries[name] = HdrHistogram.build({
          bitBucketSize: 64,
          autoResize: true,
          lowestDiscernibleValue: 2,
          highestTrackableValue: 1e12,
          numberOfSignificantValueDigits: 1
        });
      }

      result._summaries[name].add(histo);
    });

    const ks = Object.keys(stats._rates);
    for(let i = 0; i < ks.length; i++) {
      const name = ks[i];
      const eventTimestamps = stats._rates[name];
      const eventTimestamps2 = result._rates[name] || [];
      result._rates[name] = mergeSorted(eventTimestamps, eventTimestamps2);
    }
  });

  result._createdOn = L.map(statsObjects, '_createdOn').sort()[0];

  return result;
}

function mergeSorted(arr1, arr2) {
  let merged = [];
  let i1 = 0;
  let i2 = 0;
  let curr = 0;

  while (curr < (arr1.length + arr2.length)) {

    const isArr1Depleted = i1 >= arr1.length;
    const isArr2Depleted = i2 >= arr2.length;

    if (!isArr1Depleted && (isArr2Depleted || (arr1[i1] < arr2[i2]))) {
      merged[curr] = arr1[i1];
      i1++;
    } else {
      merged[curr] = arr2[i2];
      i2++;
    }

    curr++;
  }

  return merged;
}

function Stats() {
  return this.reset();
}

Stats.prototype.getCounter = function(name) {
  return this._counters[name] || 0; // always default to 0
}

// Return value of a rate which is average per second of the recorded time period
Stats.prototype.getRate = function(name) {
  const events = this._rates[name];
  if (!events) {
    return 0;
  }

  const delta = new Date() - this._createdOn;
  return round(events.length / delta * 1000, 0);
}

Stats.prototype.clone = function() {
  return L.cloneDeep(this);
};

Stats.prototype.report = function() {
  let result = {};

  result.timestamp = new Date().toISOString();

  result.rates = {};
  L.each(this._rates, (events, name) => {
    result.rates[name] = this.getRate(name);
  });

  result.errors = {}; // retain as an object
  L.each(this._counters, (count, name) => {
    if (name.startsWith('errors.')) {
      const errCode = name.split('errors.')[1];
      result.errors[errCode] = count;
    }
  });

  result.summaries = {};
  L.each(this._summaries, function(ns, name) {
    result.summaries[name] = {
      min: round(ns.minNonZeroValue, 1),
      max: round(ns.maxValue, 1),
      median: round(ns.getValueAtPercentile(50), 1),
      p75: round(ns.getValueAtPercentile(75), 1),
      p95: round(ns.getValueAtPercentile(95), 1),
      p99: round(ns.getValueAtPercentile(99), 1)
    };
  });
  result.counters = this._counters;

  //
  // Backwards-compatibility
  //
  result.scenariosCreated = this.getCounter('core.scenarios.created.total');
  result.scenarioCounts = {};
  L.each(this._counters, (count, name) => {
    if (name.startsWith('core.scenarios.created.')) {
      const scname = name.split('core.scenarios.created.')[1];
      result.scenarioCounts[scname] = count;
    }
  });
  result.scenariosCompleted = this.getCounter('core.scenarios.completed');
  result.scenariosAvoided = this.getCounter('core.scenarios.skipped');
  result.requestsCompleted = this.getCounter('engine.http.responses')|| this.getCounter('engine.socketio.emit') || this.getCounter('engine.websocket.messages_sent');
  // TODO: concurrency

  result.rps = {
    mean: this.getRate('engine.http.request_rate') || this.getRate('engine.socketio.emit_rate') || this.getRate('engine.websocket.send_rate')
  };

  const ns = this._summaries['engine.http.response_time'] || this._summaries['engine.socketio.response_time'];
  if (ns) {
    result.latency = {
      min: round(ns.minNonZeroValue, 1),
      max: round(ns.maxValue, 1),
      median: round(ns.getValueAtPercentile(50), 1),
      p75: round(ns.getValueAtPercentile(75), 1),
      p95: round(ns.getValueAtPercentile(95), 1),
      p99: round(ns.getValueAtPercentile(99), 1)
    };
  }
  // TODO: scenarioDuration, track if needed

  const codeMetricNames = Object.keys(this._counters).filter(n => n.startsWith('engine.http.codes.'));

  result.codes = codeMetricNames.reduce((acc, name) => {
    const code = name.split('.')[3];
    acc[code] = this.getCounter(name);
    return acc;
  }, {});

  return result;
};

// TODO: Deprecate and remove
Stats.prototype.addCustomStat = function(name, n) {
  return this.summary(name, n)
};

Stats.prototype.rate = function(name) {
  if (!this._rates[name]) {
    this._rates[name] = [];
  }
  this._rates[name].push(new Date());
  return this;
}

Stats.prototype.summary = function(name, n) {
  // TODO: Should below be configurable / does it need tweaked?
  if (!this._summaries[name]) {
    this._summaries[name] = HdrHistogram.build({
      bitBucketSize: 64,
      autoResize: true,
      lowestDiscernibleValue: 1,
      highestTrackableValue: 1e9,
      numberOfSignificantValueDigits: 1
    });
  }

  this._summaries[name].recordValue(n); // ns, ms conversion happens later
  return this;

}

Stats.prototype.histogram = function(name, n) {
  return this.summary(name, n);
};

Stats.prototype.counter = function(name, value = 1) {
  if (!this._counters[name]) {
    this._counters[name] = 0;
  }
  this._counters[name] += value;
  return this;
};

Stats.prototype.reset = function() {
  this._summaries = {};
  this._counters = {};
  this._rates = {};
  this._createdOn = new Date();
  return this;
};

Stats.prototype.serialize = function() {
  this._encodedHistograms = {};
  L.each(this._summaries, (histo, name) => {
    this._encodedHistograms[name] = HdrHistogram.encodeIntoBase64String(histo);
  });

  return JSON.stringify({
    counters: this._counters,
    encodedHistograms: this._encodedHistograms
  });
};

Stats.prototype.free = function() {
  return this;
};

function round(number, decimals) {
  const m = Math.pow(10, decimals);
  return Math.round(number * m) / m;
}
