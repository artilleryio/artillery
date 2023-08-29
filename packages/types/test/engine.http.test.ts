import * as tap from 'tap';
import { validateTestScript } from './helpers';

tap.test(
  'uses "http" engine when no explicit scenario engine is provided',
  (tap) => {
    tap.same(
      validateTestScript(`
scenarios:
  - name: My HTTP scenario
    flow:
      - get:
          url: /resource
      - think: 5
`),
      []
    );

    tap.end();
  }
);

tap.test('understands explicit "http" scenario engine', (tap) => {
  tap.same(
    validateTestScript(`
scenarios:
  - name: My HTTP scenario
    engine: http
    flow:
      - get:
          url: /resource
      - think: 5
`),
    []
  );

  tap.end();
});
