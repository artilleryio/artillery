import * as tap from 'node:test';
import assert from 'node:assert';
import { validateTestScript } from './helpers.ts';

tap.test('allows arbitrary engines resembling existing one', (tap, done) => {
  assert.deepEqual(validateTestScript(`
config:
  target: https://127.0.0.1/api
  engines:
    my-custom-engine: {}
scenarios:
  - engine: my-custom-engine
    flow:
      - get:
          url: /resource
  `), []);

  done();
});

tap.test('allows arbitrary engine doing something else', (tap, done) => {
  assert.deepEqual(validateTestScript(`
  config:
    target: https://127.0.0.1/api
    engines:
      my-custom-engine: {}
  scenarios:
    - engine: my-custom-engine
      somethingelse: bananas
    `), []);

  done();
});
