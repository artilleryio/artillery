/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { test } = require('tap');
const createPhaser = require('../../lib/phases');
const util = require('node:util');
const _ = require('lodash');
const debug = require('debug')('test:phases');

//
// Ref: https://github.com/shoreditch-ops/artillery/issues/215
//
test('GH #215 regression', (t) => {
  const phaseSpec = { duration: 2, arrivalRate: 20 };
  const phaser = createPhaser([phaseSpec]);
  phaser.on('phaseCompleted', () => {
    t.comment('+ phaseCompleted event');
  });
  // The process will lock up if the Node.js bug is triggered and the test
  // will time out.
  phaser.on('done', () => {
    t.comment('+ done event');
    t.end();
  });
  phaser.run();
});

test('pause', (t) => {
  const phaseSpec = { pause: 5 };

  t.plan(4);

  const phaser = createPhaser([phaseSpec]);
  const startedAt = Date.now();
  let phaseStartedTimestamp;
  phaser.on('phaseStarted', (spec) => {
    phaseStartedTimestamp = Date.now();
    t.same(spec, phaseSpec, 'phaseStarted event emitted with correct spec');
  });
  phaser.on('phaseCompleted', (spec) => {
    t.ok(
      Date.now() - phaseStartedTimestamp > 0,
      'phaseCompleted emitted after phaseStarted'
    );
    t.same(spec, phaseSpec, 'phaseCompleted event emitted with correct spec');
  });
  phaser.on('done', () => {
    const delta = Date.now() - startedAt;
    t.ok(
      delta >= phaseSpec.pause * 1000,
      util.format(
        'pause ran for at least %s ms (delta: %s)',
        phaseSpec.pause * 1000,
        delta
      )
    );
    t.end();
  });
  phaser.run();
});

test('arrivalRate set to 0 stays at 0', (t) => {
  const phaseSpec = { rampTo: 5, arrivalRate: 0 };

  t.plan(1);
  const phaser = createPhaser([phaseSpec]);
  phaser.on('phaseStarted', (spec) => {
    t.equal(spec.arrivalRate, 0, 'arrivalRate should start as zero');
    t.end();
  });
  phaser.run();
});

test('modifies duration in phase as expected', async (t) => {
  const phaseSpec = { duration: '5s', arrivalRate: 3 };

  const phaser = createPhaser([phaseSpec]);

  phaser.on('phaseStarted', (spec) => {
    t.equal(spec.duration, 5, 'duration should be 5');
  });

  phaser.run();
});

test('modifies pause in phase as expected', async (t) => {
  const phaseSpec = { pause: '2s' };

  const phaser = createPhaser([phaseSpec]);

  phaser.on('phaseStarted', (spec) => {
    t.equal(spec.pause, 2, 'pause should be 2');
  });

  phaser.run();
});

test('throws when duration is invalid', async (t) => {
  const phaseSpec = { duration: '5 potatoes', arrivalRate: 3 };

  let phaserError;
  try {
    createPhaser([phaseSpec]);
  } catch (error) {
    phaserError = error;
  }

  t.equal(
    phaserError.message,
    'Invalid duration for phase: 5 potatoes',
    'should throw error'
  );
});

test('arrivalCount', (t) => {
  const phaseSpec = {
    duration: 10,
    arrivalCount: 5
  };
  const phaser = createPhaser([phaseSpec]);

  t.plan(5);

  const startedAt = Date.now();
  let phaseStartedTimestamp;
  let arrivals = 0;
  phaser.on('phaseStarted', (spec) => {
    phaseStartedTimestamp = Date.now();
    t.same(spec, phaseSpec, 'phaseStarted event emitted with correct spec');
  });
  phaser.on('phaseCompleted', (spec) => {
    t.ok(
      Date.now() - phaseStartedTimestamp > 0,
      'phaseCompleted emitted after phaseStarted'
    );
    t.same(spec, phaseSpec, 'phaseCompleted event emitted with correct spec');
  });
  phaser.on('arrival', () => {
    arrivals++;
  });
  phaser.on('done', () => {
    const delta = Date.now() - startedAt;
    t.ok(
      delta >= phaseSpec.duration * 1000,
      util.format(
        'arrivalCount ran for at least %s ms (delta: %s)',
        phaseSpec.duration * 1000,
        delta
      )
    );

    t.equal(
      arrivals,
      phaseSpec.arrivalCount,
      util.format(
        'saw the expected %s arrivals (expecting %s)',
        arrivals,
        phaseSpec.arrivalCount
      )
    );
    t.end();
  });
  phaser.run();
});

test('rampUp', (t) => {
  testRamp(t, {
    duration: 15,
    arrivalRate: 1,
    rampTo: 20
  });
});

test('rampDown', (t) => {
  testRamp(t, {
    duration: 15,
    arrivalRate: 20,
    rampTo: 1
  });
});

test('ramp with string inputs', (t) => {
  testRamp(t, {
    duration: '15',
    arrivalRate: '20',
    rampTo: '1.0',
    maxVusers: '40'
  });
});

function testRamp(t, phaseSpec) {
  const phaser = createPhaser([phaseSpec]);

  let expected = 0;
  const periods = Math.abs(phaseSpec.rampTo - phaseSpec.arrivalRate) + 1;
  const periodLenSec = phaseSpec.duration / periods;
  for (let i = 1; i <= periods; i++) {
    const expectedInPeriod = periodLenSec * i;
    expected += expectedInPeriod;
  }
  expected = Math.floor(expected);

  t.plan(6);

  let startedAt;
  let phaseStartedTimestamp;
  let arrivals = 0;
  phaser.on('phaseStarted', (spec) => {
    phaseStartedTimestamp = Date.now();
    t.same(spec, phaseSpec, 'phaseStarted event emitted with correct spec');
    t.equal(
      _.filter(
        [
          'arrivalRate',
          'arrivalCount',
          'pause',
          'rampTo',
          'duration',
          'maxVusers'
        ],
        (k) => !_.isUndefined(spec[k]) && typeof spec[k] !== 'number'
      ).length,
      0,
      'spec numeric values should be correctly typed'
    );
  });
  phaser.on('phaseCompleted', (spec) => {
    t.ok(
      Date.now() - phaseStartedTimestamp > 0,
      'phaseCompleted emitted after phaseStarted'
    );
    t.same(spec, phaseSpec, 'phaseCompleted event emitted with correct spec');
  });
  phaser.on('arrival', () => {
    arrivals++;
  });
  phaser.on('done', () => {
    const delta = Date.now() - startedAt;
    t.ok(
      delta >= phaseSpec.duration * 1000,
      util.format(
        'rampTo ran for at least %s ms (delta: %s)',
        phaseSpec.duration * 1000,
        delta
      )
    );

    debug('expected: %s, arrived: %s', expected, arrivals);

    t.ok(
      Math.abs(arrivals - expected) <= expected * 0.2, // large allowance
      `seen arrivals within expected bounds: ${arrivals} vs ${expected}`
    );

    t.end();
  });
  startedAt = Date.now();
  phaser.run();
}
