import * as tap from 'node:test';
import assert from 'node:assert';
import { validateTestScript } from './helpers.ts';

tap.test(
  'arrival rate phase should not allow other properties (e.g. arrivalCount)',
  (tap, done) => {
    const errors = validateTestScript(`
    config:
      target: http://localhost:3000
      phases:
        - duration: 10
          arrivalRate: 5
          arrivalCount: 3
      `);

    assert.deepEqual(errors.find(
        (error) => error.params?.additionalProperty === 'arrivalCount'
      )?.message, 'must NOT have additional properties');
    done();
  }
);

tap.test(
  'arrival count phase should not allow other properties (e.g. rampTo)',
  (tap, done) => {
    const errors = validateTestScript(`
    config:
      target: http://localhost:3000
      phases:
        - duration: 10
          arrivalCount: 3
          rampTo: 10
      `);

    assert.deepEqual(errors.find((error) => error.params?.additionalProperty === 'rampTo')
        ?.message, 'must NOT have additional properties');
    done();
  }
);

tap.test(
  'pause phase should not allow other properties (e.g. duration)',
  (tap, done) => {
    const errors = validateTestScript(`
    config:
      target: http://localhost:3000
      phases:
        - duration: 10
          pause: 3
      `);

    assert.deepEqual(errors.find((error) => error.params?.additionalProperty === 'duration')
        ?.message, 'must NOT have additional properties');
    done();
  }
);
