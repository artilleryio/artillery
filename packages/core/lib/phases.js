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
const { randomUUID } = require('crypto');
const driftless = require('driftless');
const ms = require('ms');

module.exports = phaser;

async function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function phaser(phaseSpecs) {
  let ee = new EventEmitter();

  let tasks = _.map(phaseSpecs, function (spec, i) {
    [
      'arrivalRate',
      'arrivalCount',
      'pause',
      'rampTo',
      'duration',
      'maxVusers'
    ].forEach(function (k) {
      if (isUndefined(spec[k]) || spec[k] == 'number') {
        return;
      }

      if (k == 'duration' || k == 'pause') {
        //if it's already a number in string format, don't apply ms, as it's the default behaviour, so we don't want to do ms calculations
        //otherwise, ms returns the value in milliseconds, so we need to convert to seconds
        const convertedDuration = Number.isInteger(_.toNumber(spec[k]))
          ? spec[k]
          : ms(spec[k]) / 1000;

        //throw error if invalid time format to prevent test from running infinitely
        if (!convertedDuration) {
          throw new Error(`Invalid ${k} for phase: ${spec[k]}`);
        }

        spec[k] = convertedDuration;
      }

      // Cast defined but non-number (eg: from ENV) values
      spec[k] = _.toNumber(spec[k]);
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
    spec.startTime = Date.now();
    spec.id = randomUUID();
    ee.emit('phaseStarted', spec);
    setTimeout(function () {
      spec.endTime = Date.now();
      ee.emit('phaseCompleted', spec);
      return callback(null);
    }, duration);
  };
  return task;
}

function createRamp(spec, ee) {
  const duration = spec.duration || 1;
  const arrivalRate = spec.arrivalRate;
  const rampTo = spec.rampTo;
  const worker = spec.worker;
  const totalWorkers = spec.totalWorkers;

  const difference = rampTo - arrivalRate;
  const periods = duration;
  debug(
    `worker ${worker} totalWorkers ${totalWorkers} arrivalRate ${arrivalRate} rampTo ${rampTo} difference ${difference} periods ${periods}`
  );

  const periodArrivals = [];
  const periodTick = [];
  // if there is only one peridod we generate mean arrivals
  if (periods === 1) {
    const rawPeriodArrivals = (rampTo + arrivalRate) / 2;
    periodArrivals[0] = adjustArrivalsByWorker(
      rawPeriodArrivals,
      totalWorkers,
      worker
    );
  } else {
    // for each period we calculate the corresponding arrivals:
    // knowing that arrivals(0) = arrivalRate and arrivals(duration -1) = rampTo
    // then: arrivals(t) = difference / (duration-1) * t + arrivalRate
    for (let i = 0; i < periods; i++) {
      const rawPeriodArrivals = (difference / (duration - 1)) * i + arrivalRate;

      // take into account added decimals and bump worker arrivals if needed
      periodArrivals[i] = adjustArrivalsByWorker(
        rawPeriodArrivals,
        totalWorkers,
        worker
      );

      // Needed ticks to get to periodArrivals in 1000ms
      periodTick[i] = Math.min(Math.floor(1000 / periodArrivals[i]), 1000);
    }
  }

  debug(`periodArrivals ${periodArrivals}`);
  debug(`periodTick ${periodTick}`);

  return async function rampTask(callback) {
    spec.startTime = Date.now();
    spec.id = randomUUID();
    ee.emit('phaseStarted', spec);
    for (let period = 0; period < periods; period++) {
      ticker(period);
      await sleep(1000);
    }
    spec.endTime = Date.now();
    ee.emit('phaseCompleted', spec);
  };

  function adjustArrivalsByWorker(rawPeriodArrivals, totalWorkers, worker) {
    // We use the floor of the expected arrivals, then we add up all decimal digits
    // and evaluate if one or more workers should bump their arrivalRate.
    let arrivals = Math.floor(rawPeriodArrivals);

    // Think of fractionalPart * workers as the amount of arrivals that could not be
    // shared evenly across all workers.
    if (Math.round((rawPeriodArrivals % 1) * totalWorkers) >= worker) {
      arrivals = arrivals + 1;
    }
    return arrivals;
  }

  function ticker(currentPeriod) {
    // ensure we don't go past 1s
    const delay = Math.min(periodTick[currentPeriod], 1000);
    let currentArrivals = 0;
    let arrivalTimer = driftless.setDriftlessInterval(function arrivals() {
      if (currentArrivals < periodArrivals[currentPeriod]) {
        ee.emit('arrival', spec);
        currentArrivals++;
      } else {
        currentPeriod++;
        driftless.clearDriftless(arrivalTimer);
      }
    }, delay);
    return;
  }
}

function createArrivalCount(spec, ee) {
  const task = function (callback) {
    spec.startTime = Date.now();
    spec.id = randomUUID();
    ee.emit('phaseStarted', spec);
    const duration = spec.duration * 1000;

    if (spec.arrivalCount > 0) {
      const interval = duration / spec.arrivalCount;
      const p = arrivals.uniform.process(interval, duration);
      p.on('arrival', function () {
        ee.emit('arrival', spec);
      });
      p.on('finished', function () {
        spec.endTime = Date.now();
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
    spec.startTime = Date.now();
    spec.id = randomUUID();
    ee.emit('phaseStarted', spec);
    const ar = 1000 / spec.arrivalRate;
    const duration = spec.duration * 1000;
    debug('creating a %s process for arrivalRate', spec.mode);
    const p = arrivals[spec.mode].process(ar, duration);
    p.on('arrival', function () {
      ee.emit('arrival', spec);
    });
    p.on('finished', function () {
      spec.endTime = Date.now();
      ee.emit('phaseCompleted', spec);
      return callback(null);
    });
    p.start();
  };

  return task;
}
