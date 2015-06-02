'use strict';

module.exports = {
  uniform: {
    process: createUniform
  },
  poisson: {
    process: createPoisson
    //randomGenerator: createPoissonRandomGenerator
  }
};

function createUniform(tickInterval, callback) {
  var up = new UniformProcess(tickInterval, callback);
  return up;
}

function createPoisson(mean, callback) {
  return new PoissonProcess(mean, callback);
}

/**
 * Evenly-distributed events.
 * @constructor
 * @param {number} tickInterval - time between arrivals
 * @callback callback - called on each arrival
 */
function UniformProcess(tickInterval, callback) {
  this._tickInterval = tickInterval;
  this._callback = callback;
  this._interval = null;
  return this;
}

UniformProcess.prototype.start = function() {
  this._interval = setInterval(this._callback, this._tickInterval);
  return this;
};

UniformProcess.prototype.stop = function() {
  clearInterval(this._interval);
  return this;
};

/**
 * Events distributed by a Poisson process.
 * @constructor
 * @param {number} mean - mean time between arrivals
 * @callback callback - called on each arrival
 */
function PoissonProcess(mean, callback) {
  this._mean = mean;
  this._callback = callback;
  this._timeout = null;
  return this;
}

PoissonProcess.prototype.start = function() {
  var dt = sample(this._mean);
  var self = this;
  self._timeout = setTimeout(function() {
    self.start();
    self._callback();
  }, dt);
};

PoissonProcess.prototype.stop = function() {
  clearTimeout(this._timeout);
};

function sample(l) {
  // http://wwwhome.math.utwente.nl/~scheinhardtwrw/ISP2013/sheets9.pdf
  return -Math.log(Math.random()) * l;
}
