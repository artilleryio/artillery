import * as tap from 'tap';
import { validateTestScript } from './helpers';

tap.test(
  'arrival rate phase should not allow other properties (e.g. arrivalCount)',
  (tap) => {
    const errors = validateTestScript(`
    config:
      target: http://localhost:3000
      phases:
        - duration: 10
          arrivalRate: 5
          arrivalCount: 3
      `);

    tap.same(
      errors.find(
        (error) => error.params?.additionalProperty === 'arrivalCount'
      )?.message,
      'must NOT have additional properties'
    );
    tap.end();
  }
);

tap.test(
  'arrival count phase should not allow other properties (e.g. rampTo)',
  (tap) => {
    const errors = validateTestScript(`
    config:
      target: http://localhost:3000
      phases:
        - duration: 10
          arrivalCount: 3
          rampTo: 10
      `);

    tap.same(
      errors.find((error) => error.params?.additionalProperty === 'rampTo')
        ?.message,
      'must NOT have additional properties'
    );
    tap.end();
  }
);

tap.test(
  'pause phase should not allow other properties (e.g. duration)',
  (tap) => {
    const errors = validateTestScript(`
    config:
      target: http://localhost:3000
      phases:
        - duration: 10
          pause: 3
      `);

    tap.same(
      errors.find((error) => error.params?.additionalProperty === 'duration')
        ?.message,
      'must NOT have additional properties'
    );
    tap.end();
  }
);
