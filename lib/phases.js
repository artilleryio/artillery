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
  const incBy = (spec.rampTo - spec.arrivalRate) / (spec.duration - 1);
  const stepCount = spec.duration;
  const arrivalRate = spec.arrivalRate;

  debug('rampTo: incBy = %s', incBy);
  let steps = _.map(_.range(0, stepCount), function(i) {
    return function(callback) {
      let tick = 1000 / (arrivalRate + i * incBy);
      debug('rampTo: tick = %s', tick);
      let p = arrivals.uniform.process(tick, 1000);
      p.on('arrival', function() {
        ee.emit('arrival');
      });
      p.on('finished', function() {
        return callback(null);
      });
      p.start();
    };
  });

  const task = function task(callback) {
    ee.emit('phaseStarted', spec);
    async.series(steps, function(err) {
      if (err) {
        debug(err);
      }
      ee.emit('phaseCompleted', spec);
      return callback(null);
    });
  };

  return task;
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
