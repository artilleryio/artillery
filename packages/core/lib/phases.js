/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const EventEmitter = require('eventemitter3');
const async = require('async');
const _ = require('lodash');
const isUndefined = _.isUndefined;
const arrivals = require('arrivals');
const debug = require('debug')('phases');
const crypto = require('crypto');
const driftless = require('driftless');
const sleep = require('../../artillery/lib/util/sleep');

module.exports = phaser;

function phaser(phaseSpecs) {
  let ee = new EventEmitter();

  let tasks = _.map(phaseSpecs, function (spec, i) {
    // Cast defined but non-number (eg: from ENV) values
    [
      'arrivalRate',
      'arrivalCount',
      'pause',
      'rampTo',
      'duration',
      'maxVusers'
    ].forEach(function (k) {
      if (!isUndefined(spec[k]) && typeof spec[k] !== 'number') {
        spec[k] = _.toNumber(spec[k]);
      }
    });

    if (isUndefined(spec.index)) {
      spec.index = i;
    }

    if (!isUndefined(spec.arrivalRate) && isUndefined(spec.rampTo)) {
      spec.mode = spec.mode || 'uniform';
    }

    if (!isUndefined(spec.pause)) {
      return createPause(spec, ee);
    }

    if (!isUndefined(spec.arrivalCount)) {
      return createArrivalCount(spec, ee);
    }

    if (!isUndefined(spec.arrivalRate)) {
      // If arrivalRate is zero and it's not a ramp, it's the same as a pause:
      if (spec.arrivalRate === 0 && isUndefined(spec.rampTo)) {
        return createPause(Object.assign(spec, { pause: spec.duration }), ee);
      }

      // If it's a ramp, create that:
      if (!isUndefined(spec.rampTo)) {
        return createRamp(spec, ee);
      }

      // Otherwise it's a plain arrival phase:
      return createArrivalRate(spec, ee);
    }

    console.log('Unknown phase spec\n%j\nThis should not happen', spec);
  });

  ee.run = function () {
    async.series(tasks, function (err) {
      if (err) {
        debug(err);
      }

      ee.emit('done');
    });
  };

  return ee;
}

function createPause(spec, ee) {
  const duration = spec.pause * 1000;
  const task = function (callback) {
    ee.emit('phaseStarted', spec);
    setTimeout(function () {
      ee.emit('phaseCompleted', spec);
      return callback(null);
    }, duration);
  };
  return task;
}

function createRamp(spec, ee) {
  const FRACTIONAL_CORRECTION = 1.1;
  const duration = spec.duration || 1;
  const arrivalRate = spec.arrivalRate;
  const rampTo = spec.rampTo;
  const worker = spec.worker;
  const totalWorkers = spec.totalWorkers;

  const difference = rampTo - arrivalRate;
  const periods = duration;
  debug(`worker ${worker} totalWorkers ${totalWorkers} arrivalRate ${arrivalRate} rampTo ${rampTo} difference ${difference} periods ${periods}`);

  const periodArrivals = [];
  const periodTick = [];
  // if there is only one peridod we generate mean arrivals
  if (periods === 1) {
    periodArrivals[0] = Math.floor((rampTo + arrivalRate) / 2);
    periodTick[0] = 1000 / periodArrivals;
  } else {
    // for each period we calculate the corresponding arrivals:
    // knowing that arrivals(0) = arrivalRate and arrivals(duration -1) = rampTo
    // then: arrivals(t) = difference / (duration-1) * t + arrivalRate
    for (let i = 0; i < periods; i++) {
      const rawPeriodArrivals = (difference / (duration - 1)) * i + arrivalRate;

      // We use the floor of the expected arrivals, then we add up all decimal digits
      // and evaluate if one or more workers should bump their arrivalRate.
      periodArrivals[i] = Math.floor(rawPeriodArrivals);

      // Think of fractionalPart * workers as the amount of arrivals that could not be
      // shared evenly across all workers. Multiplier is used to adress fraction precision
      // i.e: (X.3333333333 % 1) * 3 < 1
      if ((rawPeriodArrivals % 1) * totalWorkers * FRACTIONAL_CORRECTION >= worker) {
        periodArrivals[i] = periodArrivals[i] + 1;
      }

      // Needed ticks to get to periodArrivals in 1000ms
      periodTick[i] = periodArrivals[i] > 0 ? Math.floor(1000 / periodArrivals[i]) : 1000;
    }
  }

  debug(`periodArrivals ${periodArrivals}`);
  debug(`periodTick ${periodTick}`);

  return async function rampTask(callback) {
    ee.emit('phaseStarted', spec);
    for (let period = 0; period < periods; period++) {
      ticker(period);
      await sleep(1000);
    }

    ee.emit('phaseCompleted', spec);
  }

  function ticker(currentPeriod) {
    let currentArrivals = 0;
    let arrivalTimer = driftless.setDriftlessInterval(function arrivals() {
      if (currentArrivals < periodArrivals[currentPeriod]) {
        ee.emit('arrival', spec);
        currentArrivals++;
      } else {
        currentPeriod++;
        driftless.clearDriftless(arrivalTimer);
      }
    }, periodTick[currentPeriod]);
    return;
  }
}

function createArrivalCount(spec, ee) {
  const task = function (callback) {
    ee.emit('phaseStarted', spec);
    const duration = spec.duration * 1000;

    if (spec.arrivalCount > 0) {
      const interval = duration / spec.arrivalCount;
      const p = arrivals.uniform.process(interval, duration);
      p.on('arrival', function () {
        ee.emit('arrival', spec);
      });
      p.on('finished', function () {
        ee.emit('phaseCompleted', spec);
        return callback(null);
      });
      p.start();
    } else {
      return callback(null);
    }
  };

  return task;
}

function createArrivalRate(spec, ee) {
  const task = function (callback) {
    ee.emit('phaseStarted', spec);
    const ar = 1000 / spec.arrivalRate;
    const duration = spec.duration * 1000;
    debug('creating a %s process for arrivalRate', spec.mode);
    const p = arrivals[spec.mode].process(ar, duration);
    p.on('arrival', function () {
      ee.emit('arrival', spec);
    });
    p.on('finished', function () {
      ee.emit('phaseCompleted', spec);
      return callback(null);
    });
    p.start();
  };

  return task;
}
