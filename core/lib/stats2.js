/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const L = require('lodash');
const sl = require('stats-lite');

module.exports = {
  create: create,
  combine: combine,
  round: round
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
    L.each(stats._latencies, function(latency) {
      result._latencies.push(latency);
    });
    result._generatedScenarios += stats._generatedScenarios;
    L.each(stats._scenarioCounter, function(count, name) {
      if(result._scenarioCounter[name]) {
        result._scenarioCounter[name] += count;
      } else {
        result._scenarioCounter[name] = count;
      }
    });
    result._completedScenarios += stats._completedScenarios;
    result._scenariosAvoided += stats._scenariosAvoided;
    L.each(stats._codes, function(count, code) {
      if(result._codes[code]) {
        result._codes[code] += count;
      } else {
        result._codes[code] = count;
      }
    });
    L.each(stats._errors, function(count, error) {
      if(result._errors[error]) {
        result._errors[error] += count;
      } else {
        result._errors[error] = count;
      }
    });
    L.each(stats._requestTimestamps, function(timestamp) {
      result._requestTimestamps.push(timestamp);
    });
    result._completedRequests += stats._completedRequests;
    L.each(stats._scenarioLatencies, function(latency) {
      result._scenarioLatencies.push(latency);
    });
    result._matches += stats._matches;

    L.each(stats._counters, function(value, name) {
      if (!result._counters[name]) {
        result._counters[name] = 0;
      }
      result._counters[name] += value;
    });
    L.each(stats._customStats, function(values, name) {
      if (!result._customStats[name]) {
        result._customStats[name] = [];
      }

      L.each(values, function(v) {
        result._customStats[name].push(v);
      });
    });

    result._concurrency += stats._concurrency || 0;
    result._pendingRequests += stats._pendingRequests;
  });

  return result;
}

function Stats() {
  return this.reset();
}

Stats.prototype.addEntry = function(entry) {
  this._entries.push(entry);
  return this;
};

Stats.prototype.getEntries = function() {
  return this._entries;
};

Stats.prototype.newScenario = function(name) {
  if (this._scenarioCounter[name]) {
    this._scenarioCounter[name]++;
  } else {
    this._scenarioCounter[name] = 1;
  }

  this._generatedScenarios++;
  return this;
};

Stats.prototype.completedScenario = function() {
  this._completedScenarios++;
  return this;
};

Stats.prototype.avoidedScenario = function() {
  this._scenariosAvoided++;
  return this;
};

Stats.prototype.addCode = function(code) {
  if (!this._codes[code]) {
    this._codes[code] = 0;
  }
  this._codes[code]++;
  return this;
};

Stats.prototype.addError = function(errCode) {
  if (!this._errors[errCode]) {
    this._errors[errCode] = 0;
  }
  this._errors[errCode]++;
  return this;
};

Stats.prototype.newRequest = function() {
  this._requestTimestamps.push(Date.now());
  return this;
};

Stats.prototype.completedRequest = function() {
  this._completedRequests++;
  return this;
};

Stats.prototype.addLatency = function(delta) {
  this._latencies.push(delta);
  return this;
};

Stats.prototype.addScenarioLatency = function(delta) {
  this._scenarioLatencies.push(delta);
  return this;
};

Stats.prototype.addMatch = function() {
  this._matches++;
  return this;
};

Stats.prototype.clone = function() {
  return L.cloneDeep(this);
};

Stats.prototype.report = function() {
  let result = {};

  result.timestamp = new Date().toISOString();
  result.scenariosCreated = this._generatedScenarios;
  result.scenariosCompleted = this._completedScenarios;
  result.requestsCompleted = this._completedRequests;

  let latencies = this._latencies;

  result.latency = {
    min: round(L.min(latencies) / 1e6, 1),
    max: round(L.max(latencies) / 1e6, 1),
    median: round(sl.median(latencies) / 1e6, 1),
    p95: round(sl.percentile(latencies, 0.95) / 1e6, 1),
    p99: round(sl.percentile(latencies, 0.99) / 1e6, 1)
  };

  let startedAt = L.min(this._requestTimestamps);
  let now = Date.now();
  let count = L.size(this._requestTimestamps);
  let mean = Math.round(
    (count / (Math.round((now - startedAt) / 10) / 100)) * 100) / 100;

  result.rps = {
    count: count,
    mean: mean
  };

  result.scenarioDuration = {
    min: round(L.min(this._scenarioLatencies) / 1e6, 1),
    max: round(L.max(this._scenarioLatencies) / 1e6, 1),
    median: round(sl.median(this._scenarioLatencies) / 1e6, 1),
    p95: round(sl.percentile(this._scenarioLatencies, 0.95) / 1e6, 1),
    p99: round(sl.percentile(this._scenarioLatencies, 0.99) / 1e6, 1)
  };

  result.scenarioCounts = this._scenarioCounter;

  result.errors = this._errors;
  result.codes = this._codes;
  result.matches = this._matches;

  result.latencies = latencies;

  result.customStats = {};
  L.each(this._customStats, function(ns, name) {
    result.customStats[name] = {
      min: round(L.min(ns), 1),
      max: round(L.max(ns), 1),
      median: round(sl.median(ns), 1),
      p95: round(sl.percentile(ns, 0.95), 1),
      p99: round(sl.percentile(ns, 0.99), 1)
    };
  });
  result.counters = this._counters;

  if (this._concurrency !== null) {
    result.concurrency = this._concurrency;
  }
  result.pendingRequests = this._pendingRequests;
  result.scenariosAvoided = this._scenariosAvoided;

  return result;
};

Stats.prototype.addCustomStat = function(name, n) {
  if (!this._customStats[name]) {
    this._customStats[name] = [];
  }

  this._customStats[name].push(n);
  return this;
};

Stats.prototype.counter = function(name, value) {
  if (!this._counters[name]) {
    this._counters[name] = 0;
  }
  this._counters[name] += value;
  return this;
};

Stats.prototype.reset = function() {
  this._entries = [];
  this._latencies = [];
  this._generatedScenarios = 0;
  this._completedScenarios = 0;
  this._codes = {};
  this._errors = {};
  this._requestTimestamps = [];
  this._completedRequests = 0;
  this._scenarioLatencies = [];
  this._matches = 0;
  this._customStats = {};
  this._counters = {};
  this._concurrency = null;
  this._pendingRequests = 0;
  this._scenariosAvoided = 0;
  this._scenarioCounter = {};
  return this;
};

Stats.prototype.free = function() {
  return this;
};

function round(number, decimals) {
  const m = Math.pow(10, decimals);
  return Math.round(number * m) / m;
}
