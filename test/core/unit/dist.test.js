'use strict';

const tap = require('tap');
const divideWork = require('../../../lib/dist');


tap.test('divideWork', (t) => {
  const numWorkers = 5;
  const script = {
    config: {
      target: 'http://targ.get.url',
      phases: [{ name: 'arrivalCount', duration: 10, arrivalCount: 5 }]
    },
    scenarios: [
      {
        flow: [
          {
            get: {
              url: '/'
            }
          }
        ]
      }
    ]
  };

  const phases = divideWork(script, numWorkers);

  t.equal(phases.length, numWorkers, 'it divides work for workers');
  t.equal(
    phases.filter(
      (phase) =>
        phase.config.phases.length === script.config.phases.length &&
        'arrivalCount' in phase.config.phases[0]
    ).length,
    1,
    'arrivalCount is assigned to just one worker'
  );
  t.equal(
    phases.filter(
      (phase) =>
        phase.config.phases.length === script.config.phases.length &&
        'pause' in phase.config.phases[0]
    ).length,
    numWorkers - 1,
    'arrivalCount is replaced with a pause phase in all but one of the worker scripts'
  );

  t.ok(
    phases
      .slice(1)
      .every(
        (phase) =>
          'pause' in phase.config.phases[0] &&
          phase.config.phases[0].name === script.config.phases[0].name
      ),
    'pause phases created to replace arrivalCounts keep the same name as the original arrivalCount phase'
  );

  t.end();
});

tap.test('set max vusers', (t) => {
  const numWorkers = 5;
  const script = {
    config: {
      target: 'http://targ.get.url',
      phases: [{ name: 'vusers', duration: 10, maxVusers: 20, arrivalRate: 100 }]
    },
    scenarios: [
      {
        flow: [
          {
            get: {
              url: '/'
            }
          }
        ]
      }
    ]
  };

  const phases = divideWork(script, numWorkers);
  const actualVusers = phases.reduce((partialSum, phase) =>
    partialSum + phase.config.phases[0].maxVusers, 0);
  t.equal(script.config.phases[0].maxVusers, actualVusers);
  t.end();
});

tap.test('arrivalRate defaults to zero if not present', (t) => {
  const numWorkers = 5;
  const script = {
    config: {
      target: 'http://targ.get.url',
      phases: [{ name: 'rampto', duration: 10, rampTo: 25 }]
    },
    scenarios: [
      {
        flow: [
          {
            get: {
              url: '/'
            }
          }
        ]
      }
    ]
  };

  const phases = divideWork(script, numWorkers);
  const totalArrivalRate = phases.reduce((partialSum, phase) =>
    partialSum + phase.config.phases[0].arrivalRate, 0);

  t.equal(totalArrivalRate, 0);
  t.end();
});
