'use strict';

const test = require('tape');
const createPhaser = require('../../lib/phases');
const util = require('util');
const _ = require('lodash');
const debug = require('debug')('test:phases');

/*
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
*/

test('ramp', function(t) {
  const phaseSpec = {
    duration: 60,
    arrivalRate: 15,
    rampTo: 100
  };
  let phaser = createPhaser([phaseSpec]);

  let incBy = (phaseSpec.rampTo - phaseSpec.arrivalRate) / (phaseSpec.duration - 1);
  let expected = phaseSpec.arrivalRate;
  for(let i = 0; i < phaseSpec.duration; i++) {
    let tick = 1000 / (phaseSpec.arrivalRate + i * incBy);
    expected += Math.floor(1000 / Math.ceil(tick));
  }

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
    //debug('+ arrival');
    arrivals++;
  });
  phaser.on('done', function() {
    let delta = Date.now() - startedAt;
    t.assert(
      delta >= phaseSpec.duration * 1000,
      util.format('rampTo ran for at least %s ms (delta: %s)', phaseSpec.duration * 1000, delta));

    debug('expected: %s, arrived: %s', expected, arrivals);

    t.assert(
      arrivals * 1.1 > expected,
      'seen arrivals within expected bounds');

    t.end();
  });
  startedAt = Date.now();
  phaser.run();
});
