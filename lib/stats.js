'use strict';

var Measured = require('measured');
var _ = require('lodash');

module.exports = {
  create: create
};

function create() {
  return new Statham();
}

function Statham() {
  this._collection = {
    // Total number of scenarios generated
    generatedScenarios: new Measured.Counter(),
    // Number of scenarios that ran through to successful completion
    completedScenarios: new Measured.Counter(),
    // Number of requests that completed successfully
    completedRequests: new Measured.Counter(),
    rps: new Measured.Meter({
      rateUnit: 1 * 1000,
      tickInterval: 1 * 1000
    }),
    latency: new Measured.Histogram(),
    scenarioLatency: new Measured.Histogram(),
    // Operational errors: ETIMEDOUT, ECONNREFUSED etc.
    errors: {
    },
    // Response codes, such as 200 for HTTP.
    codes: {
    }
  };

  return this;
}

Statham.prototype.newScenario = function() {
  this._collection.generatedScenarios.inc();

  return this;
};

Statham.prototype.completedScenario = function() {
  this._collection.completedScenarios.inc();

  return this;
};

Statham.prototype.addCode = function(code) {
  if (!this._collection.codes[code]) {
    this._collection.codes[code] = new Measured.Counter();
  }
  this._collection.codes[code].inc();

  return this;
};

Statham.prototype.addError = function(errCode) {
  if (!this._collection.errors[errCode]) {
    this._collection.errors[errCode] = new Measured.Counter();
  }
  this._collection.errors[errCode].inc();

  return this;
};

Statham.prototype.newRequest = function() {
  this._collection.rps.mark();

  return this;
};

Statham.prototype.completedRequest = function() {
  this._collection.completedRequests.inc();

  return this;
};

Statham.prototype.addLatency = function(delta) {
  this._collection.latency.update(delta);

  return this;
};

Statham.prototype.addScenarioLatency = function(delta) {
  this._collection.scenarioLatency.update(delta);

  return this;
};

Statham.prototype.report = function() {
  var collection = this._collection;
  var latency = collection.latency.toJSON();
  var sl = collection.scenarioLatency.toJSON();
  var rps = collection.rps.toJSON();

  var result = {
    timestamp: new Date().toISOString(),
    scenariosCreated: collection.generatedScenarios.toJSON(),
    scenariosCompleted: collection.completedScenarios.toJSON(),
    requestsCompleted: collection.completedRequests.toJSON(),
    rps: {
      mean: Math.round(rps.mean * 100) / 100,
      count: rps.count
    },
    latency: {
      min: latency.min ? Math.round(latency.min / 1e6 * 100) / 100 : null,
      max: latency.max ? Math.round(latency.max / 1e6 * 100) / 100 : null,
      median: latency.median ?
        Math.round(latency.median / 1e6 * 100) / 100 : null,
      p95: latency.p95 ? Math.round(latency.p95 / 1e6 * 100) / 100 : null,
      p99: latency.p99 ? Math.round(latency.p99 / 1e6 * 100) / 100 : null
    },
    scenarioDuration: {
      min: sl.min ? Math.round(sl.min / 1e6 * 100) / 100 : null,
      max: sl.max ? Math.round(sl.max / 1e6 * 100) / 100 : null,
      median: sl.median ? Math.round(sl.median / 1e6 * 100) / 100 : null,
      p95: sl.p95 ? Math.round(sl.p95 / 1e6 * 100) / 100 : null,
      p99: sl.p99 ? Math.round(sl.p99 / 1e6 * 100) / 100 : null
    },
    errors: _.foldl(collection.errors, function(acc, v, k) {
      acc[k] = v._count; return acc;
    }, {}),
    codes: _.foldl(collection.codes, function(acc, v, k) {
      acc[k] = v._count; return acc;
    }, {})
  };

  return result;
};

Statham.prototype.reset = function() {
  this._collection.generatedScenarios.reset();
  this._collection.completedScenarios.reset();
  this._collection.completedRequests.reset();
  this._collection.rps.reset();
  clearInterval(this._collection.rps._interval);
  this._collection.rps = new Measured.Meter({
    rateUnit: 1 * 1000,
    tickInterval: 1 * 1000
  });
  this._collection.latency.reset();
  this._collection.scenarioLatency.reset();
  this._collection.errors = {};
  this._collection.codes = {};
};

Statham.prototype.free = function() {
  this._collection.rps.unref();
};
