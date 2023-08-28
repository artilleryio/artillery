import * as tap from 'tap';
import { validateTestScript } from './helpers';

tap.test('validates scenario flow using "websocket" scenario engine', (tap) => {
  tap.same(
    validateTestScript(`
scenarios:
  - engine: websocket
    flow:
      - send: Hello world
  `),
    []
  );

  tap.end();
});

tap.test('supports general scenario flow properties', (tap) => {
  tap.same(
    validateTestScript(`
scenarios:
  - engine: websocket
    flow:
      - log: Debug here
      - think: 5
  `),
    []
  );

  tap.end();
});

/**
 * @note Skipped until we implement discriminated union
 * between the engine value and the scenario properties.
 * That cannot be represented by plain TypeScript as of now.
 */
tap.skip(
  'errors on http flow when using "websocket" scenario engine',
  (tap) => {
    tap.ok(
      validateTestScript(`
scenarios:
  - name: My HTTP scenario
    engine: websocket
    flow:
      - get:
          url: /resource
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
  - engine: websocket
    flow:
      - connect:
          # Intentionally incorrect "target" value.
          target: 123
  `);

    const connectTargetError = errors.find((error) => {
      return error.instancePath === '/scenarios/0/flow/0/connect/target';
    });

    /**
     * @note Although there's no discrimination of scenario properties
     * based on the "engine" used, the known properties are still
     * validated against their expected types.
     */
    tap.ok(connectTargetError);
    tap.same(connectTargetError.params, {
      type: 'string'
    });
    tap.same(connectTargetError.message, 'must be string');

    tap.end();
  }
);
