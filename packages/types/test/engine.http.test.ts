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

/**
 * @note Skipped until we implement discriminated union
 * between the engine value and the scenario properties.
 * That cannot be represented by plain TypeScript as of now.
 */
tap.skip(
  'errors on using non-http properties without exlpicit scenario engine',
  (tap) => {
    tap.ok(
      validateTestScript(`
scenarios:
- flow:
    - send: Oops, not WebSocket!
`).length > 0
    );

    tap.end();
  }
);

tap.test(
  'errors when providing incorrect values to known properties',
  (tap) => {
    const errors = validateTestScript(`
scenarios:
  - flow:
      - get:
          # Intentionally incorrect "url" value.
          url: 123
  `);

    const urlError = errors.find((error) => {
      return error.instancePath === '/scenarios/0/flow/0/get/url';
    });

    /**
     * @note Although there's no discrimination of scenario properties
     * based on the "engine" used, the known properties are still
     * validated against their expected types.
     */
    tap.ok(urlError);
    tap.same(urlError.params, {
      type: 'string'
    });
    tap.same(urlError.message, 'must be string');

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
