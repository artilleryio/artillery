/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const test = require('tape');
const createPhaser = require('../../../core/lib/phases');
const util = require('util');
const _ = require('lodash');
const debug = require('debug')('test:phases');

//
// Ref: https://github.com/shoreditch-ops/artillery/issues/215
//
test('GH #215 regression', function(t) {
  const phaseSpec = { duration: 2, arrivalRate: 20 };
  let phaser = createPhaser([phaseSpec]);
  phaser.on('phaseCompleted', function() {
    t.comment('+ phaseCompleted event');
  });
  // The process will lock up if the Node.js bug is triggered and the test
  // will time out.
  phaser.on('done', function() {
    t.comment('+ done event');
    t.end();
  });
  phaser.run();
});

test('pause', function(t) {
  const phaseSpec = {pause: 5};

  t.plan(4);

  let phaser = createPhaser([phaseSpec]);
  let startedAt = Date.now();
  let phaseStartedTimestamp;
  phaser.on('phaseStarted', function(spec) {
    phaseStartedTimestamp = Date.now();
    t.assert(
      _.isEqual(spec, phaseSpec),
      'phaseStarted event emitted with correct spec');
  });
  phaser.on('phaseCompleted', function(spec) {
    t.assert(
      Date.now() - phaseStartedTimestamp > 0,
      'phaseCompleted emitted after phaseStarted');
    t.assert(
      _.isEqual(spec, phaseSpec),
      'phaseCompleted event emitted with correct spec');
  });
  phaser.on('done', function() {
    let delta = Date.now() - startedAt;
    t.assert(
      delta >= phaseSpec.pause * 1000,
      util.format('pause ran for at least %s ms (delta: %s)', phaseSpec.pause * 1000, delta));
    t.end();
  });
  phaser.run();
});

test('arrivalCount', function(t) {
  const phaseSpec = {
    duration: 10,
    arrivalCount: 5
  };
  let phaser = createPhaser([phaseSpec]);

  t.plan(5);

  let startedAt = Date.now();
  let phaseStartedTimestamp;
  let arrivals = 0;
  phaser.on('phaseStarted', function(spec) {
    phaseStartedTimestamp = Date.now();
    t.assert(
      _.isEqual(spec, phaseSpec),
      'phaseStarted event emitted with correct spec');
  });
  phaser.on('phaseCompleted', function(spec) {
    t.assert(
      Date.now() - phaseStartedTimestamp > 0,
      'phaseCompleted emitted after phaseStarted');
    t.assert(
      _.isEqual(spec, phaseSpec),
      'phaseCompleted event emitted with correct spec');
  });
  phaser.on('arrival', function() {
    arrivals++;
  });
  phaser.on('done', function() {
    let delta = Date.now() - startedAt;
    t.assert(
      delta >= phaseSpec.duration * 1000,
      util.format('arrivalCount ran for at least %s ms (delta: %s)', phaseSpec.duration * 1000, delta));

    t.assert(
      arrivals === phaseSpec.arrivalCount,
      util.format('saw the expected %s arrivals (expecting %s)', arrivals, phaseSpec.arrivalCount));
    t.end();
  });
  phaser.run();
});

test('rampUp', function(t) {
  testRamp(t, {
    duration: 15,
    arrivalRate: 1,
    rampTo: 20
  });
});

test('rampDown', function(t) {
  testRamp(t, {
    duration: 15,
    arrivalRate: 20,
    rampTo: 1
  });
});

function testRamp(t, phaseSpec) {
  let phaser = createPhaser([phaseSpec]);


  let expected = 0;
  let periods = Math.abs(phaseSpec.rampTo - phaseSpec.arrivalRate) + 1;
  let periodLenSec = phaseSpec.duration / periods;
  for(let i = 1; i <= periods; i++) {
    let expectedInPeriod = periodLenSec * i;
    expected += expectedInPeriod;
  }
  expected = Math.floor(expected);

  t.plan(5);

  let startedAt;
  let phaseStartedTimestamp;
  let arrivals = 0;
  phaser.on('phaseStarted', function(spec) {
    phaseStartedTimestamp = Date.now();
    t.assert(
      _.isEqual(spec, phaseSpec),
      'phaseStarted event emitted with correct spec');
  });
  phaser.on('phaseCompleted', function(spec) {
    t.assert(
      Date.now() - phaseStartedTimestamp > 0,
      'phaseCompleted emitted after phaseStarted');
    t.assert(
      _.isEqual(spec, phaseSpec),
      'phaseCompleted event emitted with correct spec');
  });
  phaser.on('arrival', function() {
    arrivals++;
  });
  phaser.on('done', function() {
    let delta = Date.now() - startedAt;
    t.assert(
      delta >= phaseSpec.duration * 1000,
      util.format('rampTo ran for at least %s ms (delta: %s)', phaseSpec.duration * 1000, delta));

    debug('expected: %s, arrived: %s', expected, arrivals);

    t.assert(
      Math.abs(arrivals - expected) <= expected * 0.2, // large allowance
      'seen arrivals within expected bounds');

    t.end();
  });
  startedAt = Date.now();
  phaser.run();
}