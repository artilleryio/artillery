import * as tap from 'tap';
import { validateTestScript } from './helpers';

tap.test('validates a script with 1 phase and 1 http scenario', (tap) => {
  const errors = validateTestScript(`
  config:
    target: http://localhost:3000
    phases:
      - duration: 10
        rampTo: 50
  scenarios:
    - engine: http
      flow:
        - get:
            url: /resource
  `);

  tap.same(errors, []);
  tap.end();
});

tap.test('validates a script without "config" set', (tap) => {
  const errors = validateTestScript(`
scenarios:
  - engine: http
    flow:
      - get:
          url: /resource
    `);

  tap.same(errors, []);
  tap.end();
});

tap.test('errors when the "scenarios" are missing', (tap) => {
  const errors = validateTestScript(`
config:
  target: http://localhost:3000
  phases:
    - duration: 10
      rampTo: 50
  `);

  tap.same(errors[0]?.params, {
    missingProperty: 'scenarios'
  });
  tap.same(errors.length, 1);
  tap.end();
});

tap.test('supports HTTP flow properties for "websockets" engine', (tap) => {
  const errors = validateTestScript(`
config:
  target: http://localhost:3000
  phases:
    - duration: 10
      rampTo: 50
scenarios:
  - engine: websocket
    flow:
      - get:
          url: /resource
      - think: 500
      - send: "hello"
`);

  tap.same(errors, []);
  tap.end();
});
