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

  t.end();
});
