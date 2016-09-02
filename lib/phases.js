/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const EventEmitter = require('events');
const async = require('async');
const _ = require('lodash');
const isUndefined = _.isUndefined;
const arrivals = require('arrivals');
const debug = require('debug')('phases');
const Nanotimer = require('nanotimer');

module.exports = phaser;

function phaser(phaseSpecs) {
  let ee = new EventEmitter();

  let tasks = _.map(phaseSpecs, function(spec, i) {
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

      // If arrivalRate is zero, it's the same as a pause:
      if (spec.arrivalRate === 0) {
        return createPause(
          Object.assign(
            spec, { pause: spec.duration }),
          ee);
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

  ee.run = function() {
    async.series(tasks, function(err) {
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
  const task = function(callback) {
    ee.emit('phaseStarted', spec);
    setTimeout(function() {
      ee.emit('phaseCompleted', spec);
      return callback(null);
    }, duration);
  };
  return task;
}

function createRamp(spec, ee) {
  // We will increase the arrival rate by 1 every tick seconds.
  // The divisor is the number of distinct arrival rates there will be (6 for
  // arrivalRate=5 and rampTo=10)

  const tick = spec.duration / (spec.rampTo - spec.arrivalRate + 1); // not precise
  debug('tick = %s', tick);
  const timer1 = new Nanotimer();
  const timer2 = new Nanotimer();

  return function task(callback) {
    ee.emit('phaseStarted', spec);
    let currentRate = spec.arrivalRate;

    timer1.setInterval(function createArrivalsAtCurrentRate() {
      timer2.clearInterval();

      const interArrivalInterval = (1000/currentRate) + 'm';
      debug('currentRate = %s', currentRate);
      debug('interArrivalInterval = %s', interArrivalInterval);

      timer2.setInterval(function generateArrival() {
        ee.emit('arrival');
        debug('arrival');
      }, '', interArrivalInterval);

      if (currentRate <= spec.rampTo) {
        currentRate++;
      } else {
        timer1.clearInterval();
        timer1.setTimeout(function() {
          timer1.clearTimeout();
          timer2.clearInterval();
          ee.emit('phaseCompleted', spec);
          return callback(null);
        }, '', '1000m');
      }
    }, '', Math.floor(tick * 1e9) + 'n');
  };
}

function createArrivalCount(spec, ee) {
  const task = function(callback) {
    ee.emit('phaseStarted', spec);
    const duration = spec.duration * 1000;
    const interval = duration / spec.arrivalCount;
    const p = arrivals.uniform.process(interval, duration);
    p.on('arrival', function() {
      ee.emit('arrival');
    });
    p.on('finished', function() {
      ee.emit('phaseCompleted', spec);
      return callback(null);
    });
    p.start();
  };

  return task;
}

function createArrivalRate(spec, ee) {
  const task = function(callback) {
    ee.emit('phaseStarted', spec);
    const ar = 1000 / spec.arrivalRate;
    const duration = spec.duration * 1000;
    debug('creating a %s process for arrivalRate', spec.mode);
    const p = arrivals[spec.mode].process(ar, duration);
    p.on('arrival', function() {
      ee.emit('arrival');
    });
    p.on('finished', function() {
      ee.emit('phaseCompleted', spec);
      return callback(null);
    });
    p.start();
  };

  return task;
}
