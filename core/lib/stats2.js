/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const L = require('lodash');
const sl = require('stats-lite');
const HdrHistogram = require('hdr-histogram-js');

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
    result._generatedScenarios += stats._generatedScenarios;
    L.each(stats._scenarioCounter, function(count, name) {
      if(result._scenarioCounter[name]) {
        result._scenarioCounter[name] += count;
      } else {
        result._scenarioCounter[name] = count;
      }
    });
    result._scenariosAvoided += stats._scenariosAvoided;
    L.each(stats._requestTimestamps, function(timestamp) {
      result._requestTimestamps.push(timestamp);
    });

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

Stats.prototype.newScenario = function(name) {
  if (this._scenarioCounter[name]) {
    this._scenarioCounter[name]++;
  } else {
    this._scenarioCounter[name] = 1;
  }

  this._generatedScenarios++;
  return this;
};

Stats.prototype.avoidedScenario = function() {
  this._scenariosAvoided++;
  return this;
};

Stats.prototype.newRequest = function() {
  this._requestTimestamps.push(Date.now());
  return this;
};

Stats.prototype.clone = function() {
  return L.cloneDeep(this);
};

Stats.prototype.report = function() {
  let result = {};

  result.timestamp = new Date().toISOString();
  result.scenariosCreated = this._counters['scenarios.created'];

  result.scenarioCounts = {};
  L.each(this._counters, (count, name) => {
    if (name.startsWith('scenarios.created.')) {
      const scname = name.split('scenarios.created.')[1];
      result.scenarioCounts[scname] = count;
    }
  });

  result.scenariosCompleted = this._counters['scenarios.completed'];
  result.requestsCompleted = this._counters['engine.http.responses_received'];

  const ns = this._customStats['engine.http.response_time'];

  result.latency = {
    min: round(L.min(ns), 1),
    max: round(L.max(ns), 1),
    median: round(sl.median(ns), 1),
    p95: round(sl.percentile(ns, 0.95), 1),
    p99: round(sl.percentile(ns, 0.99), 1)
  };

  result.rps = {
    count: result.requestsCompleted,
    mean: result.requestsCompleted / 10 // FIXME: depends on the period...
  };

  result.errors = {}; // retain as an object
  L.each(this._counters, (count, name) => {
    if (name.startsWith('errors.')) {
      const errCode = name.split('errors.')[1];
      result.errors[errCode] = count;
    }
  });

  result.codes = {};
  L.each(this._counters, (count, name) => {
    if (name.startsWith('engine.http.response_code')) {
      const code = name.split('response_code.')[1];
      result.codes[code] = count;
    }
  });

  result.matches = this._counters['matches'];

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
  this._generatedScenarios = 0;
  this._requestTimestamps = [];
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
