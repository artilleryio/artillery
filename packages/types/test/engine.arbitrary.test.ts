import * as tap from 'tap';
import { validateTestScript } from './helpers';

tap.test('allows arbitrary engines resembling existing one', (tap) => {
  tap.same(
    validateTestScript(`
config:
  target: https://127.0.0.1/api
  engines:
    my-custom-engine: {}
scenarios:
  - engine: my-custom-engine
    flow:
      - get:
          url: /resource
  `),
    []
  );

  tap.end();
});

tap.test('allows arbitrary engine doing something else', (tap) => {
  tap.same(
    validateTestScript(`
  config:
    target: https://127.0.0.1/api
    engines:
      my-custom-engine: {}
  scenarios:
    - engine: my-custom-engine
      somethingelse: bananas
    `),
    []
  );

  tap.end();
});
