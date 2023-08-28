import * as tap from 'tap';
import { validateTestScript } from './helpers';

tap.test('validates scenario flow when using "socketio" engine', (tap) => {
  tap.same(
    validateTestScript(`
scenarios:
  - engine: socketio
    flow:
      - emit:
          channel: myChannel
          data: Hello world
    `),
    []
  );

  tap.end();
});

tap.test('allows general flow properties', (tap) => {
  tap.same(
    validateTestScript(`
scenarios:
  - engine: socketio
    flow:
      - emit:
          channel: myChannel
          data: Hello world
      - think: 5
      - log: Debug here
    `),
    []
  );

  tap.end();
});

tap.test('supports HTTP flow properties for "socketio" engine', (tap) => {
  const errors = validateTestScript(`
config:
  target: http://localhost:3000
  phases:
    - duration: 10
      rampTo: 50
scenarios:
  - engine: socketio
    flow:
      - get:
          url: /resource
      - think: 500
      - emit:
          channel: "echoResponse"
          data: "hello"
      - loop:
          - post:
              url: /resource
          - emit:
              channel: "anotherChannel"
              data: "world"
        count: 5
`);

  tap.same(errors, []);
  tap.end();
});

tap.test(
  'errors when providing incorrect values to known properties',
  (tap) => {
    const errors = validateTestScript(`
scenarios:
  - engine: socketio
    flow:
      - emit:
          # Intentionally incorrect "channel" value.
          channel: 123
  `);

    const connectTargetError = errors.find((error) => {
      return error.instancePath === '/scenarios/0/flow/0/emit/channel';
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
