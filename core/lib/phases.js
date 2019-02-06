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
const crypto = require('crypto');
const driftless = require('driftless');

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

      // If arrivalRate is zero and it's not a ramp, it's the same as a pause:
      if (spec.arrivalRate === 0 && isUndefined(spec.rampTo)) {
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
  const tick = 1000 / Math.max(spec.arrivalRate, spec.rampTo); // smallest tick
  const r0 = spec.arrivalRate; // initial arrival rate
  const difference = spec.rampTo - spec.arrivalRate;
  const offset = difference < 0 ? -1 : 1;
  const periods = Math.abs(difference) + 1;
  const ticksPerPeriod = (spec.duration / periods) * 1000 / tick;
  const periodLenSec = spec.duration / periods;

  let expected = 0;
  for(let i = 1; i <= periods; i++) {
    let expectedInPeriod = periodLenSec * i;
    expected += expectedInPeriod;
  }
  expected = Math.floor(expected);

  // console.log(`expecting ${expected} total arrivals`);

  let probabilities = crypto.randomBytes(Math.ceil(spec.duration * 1000 / tick * 1.25));

  debug(`rampTo: tick = ${tick}ms; r0 = ${r0}; periods = ${periods}; ticksPerPeriod = ${ticksPerPeriod}; period length = ${periodLenSec}s`);

  return function rampTask(callback) {
    ee.emit('phaseStarted', spec);
    let currentRate = r0;
    let p = (periodLenSec * currentRate) / ticksPerPeriod;
    let ticksElapsed = 0;

    let i = 0;
    const timer = driftless.setDriftlessInterval(function maybeArrival() {
      let startedAt = Date.now();
      if(++ticksElapsed > ticksPerPeriod) {
        debug(`ticksElapsed: ${ticksElapsed}; upping probability or stopping`);
        if (offset === -1 ? currentRate > spec.rampTo : currentRate < spec.rampTo) {
          currentRate += offset;
          ticksElapsed = 0;

          p = (periodLenSec * currentRate) / ticksPerPeriod;

          debug(`update: currentRate = ${currentRate} - p = ${p}`);
          debug(`\texpecting ~${periodLenSec * currentRate} arrivals before updating again`);
        } else {
          debug(`done: ticksElapsed = ${ticksElapsed}; currentRate = ${currentRate}; spec.rampTo = ${spec.rampTo} `);

          driftless.clearDriftless(timer);
          ee.emit('phaseCompleted', spec);

          /*
          var profile = profiler.stopProfiling();
          profile.export(function(err, result) {
            if (err) {
              console.log(err);
            }
            fs.writeFileSync('profile1.json.cpuprofile', result); // extension is important
            return callback(null);
          });
           */

          return callback(null);
        }
      }

      let prob = probabilities[i++] / 256;
      if (prob <= p) {
        ee.emit('arrival', spec);
      }
    }, tick);
  };
}

function createArrivalCount(spec, ee) {
  const task = function(callback) {
    ee.emit('phaseStarted', spec);
    const duration = spec.duration * 1000;
    const interval = duration / spec.arrivalCount;
    const p = arrivals.uniform.process(interval, duration);
    p.on('arrival', function() {
      ee.emit('arrival', spec);
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
      ee.emit('arrival', spec);
    });
    p.on('finished', function() {
      ee.emit('phaseCompleted', spec);
      return callback(null);
    });
    p.start();
  };

  return task;
}
