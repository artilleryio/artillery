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
      arrivalRate: 10
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
