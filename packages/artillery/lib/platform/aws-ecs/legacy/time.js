'use strict';

const EventEmitter = require('events');
const driftless = require('driftless');

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class Timeout extends EventEmitter {
  constructor(duration) {
    super();
    this._startedAt = null;
    this._duration = duration;
    return this;
  }

  start() {
    this._startedAt = Date.now();
    this._timeout = driftless.setDriftlessTimeout(() => {
      this.emit('timeout');
    }, this._duration);
    return this;
  }

  stop() {
    driftless.clearDriftless(this._timeout);
    return this;
  }

  timedout() {
    return Date.now() - this._startedAt > this._duration;
  }
}

// Turn a string like 2m into number of milliseconds
// Supported units: ms, s, m, h
function timeStringToMs(timeStr) {
  let rx = /^([0-9]+).+$/i;

  if (!rx.test(timeStr)) {
    throw new Error(`Invalid time string: ${timeStr}`);
  }

  let multiplier = 0;
  if (timeStr.endsWith('ms')) {
    multiplier = 1;
  } else if (timeStr.endsWith('s')) {
    multiplier = 1000;
  } else if (timeStr.endsWith('m')) {
    multiplier = 60 * 1000;
  } else if (timeStr.endsWith('h')) {
    multiplier = 60 * 60 * 1000;
  } else {
    throw new Error(
      `Unknown unit suffix in ${timeStr}. Supported units: ms, s, m, h`
    );
  }

  const n = parseInt(timeStr.match(rx)[0], 10);
  return n * multiplier;
}

module.exports = {
  Timeout,
  sleep,
  timeStringToMs
};
