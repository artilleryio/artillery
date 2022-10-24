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
  const duration = spec.duration || 1;
  const arrivalRate = spec.arrivalRate;
  const rampTo = spec.rampTo;

  const tick = 1000; // 1s; match VUs arrival rate
  const difference = rampTo - arrivalRate;
  const periods = duration * 1000 / tick;

  function arrivalProbability(currentStep) {
    // linear function ax + b
    // normalized to 0 <= f(t) <= 1
    // Anything under function value should be an arrival

    let t = currentStep * tick / 1000;
    return ((difference / duration) * t + arrivalRate) / Math.max(difference, arrivalRate);
  };

  let probabilities = Array.from({length: periods}, () => Math.random());

  debug(
    `rampTo: tick = ${tick}; difference = ${difference}; rampTo: tick = ${tick}ms; arrivalRate = ${arrivalRate}; periods = ${periods}`
  );

  return function rampTask(callback) {
    ee.emit('phaseStarted', spec);
    let currentStep = 1;
    const timer = driftless.setDriftlessInterval(function maybeArrival() {
      if (currentStep <= periods) {
        let arrivalBreakpoint = arrivalProbability(currentStep);
        let roll = probabilities[currentStep];
        debug(`roll:${roll} <= breakpoint:${arrivalBreakpoint}`);
        if (roll <= arrivalBreakpoint) {
          ee.emit('arrival', spec);
        }

        currentStep++;
      } else {
        driftless.clearDriftless(timer);
        ee.emit('phaseCompleted', spec);

        return callback(null);
      }
    }, tick);
  };
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
