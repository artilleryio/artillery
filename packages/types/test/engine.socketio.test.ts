import * as tap from 'node:test';
import assert from 'node:assert';
import { validateTestScript } from './helpers.ts';

tap.test('validates scenario flow when using "socketio" engine', (tap, done) => {
  assert.deepEqual(validateTestScript(`
scenarios:
  - engine: socketio
    flow:
      - emit:
          channel: myChannel
          data: Hello world
    `), []);

  done();
});

tap.test('supports emit as an array', (tap, done) => {
  assert.deepEqual(validateTestScript(`
scenarios:
  - engine: socketio
    flow:
      - emit:
          - "myChannel"
          - "hello"
          - "world"
    `), []);

  done();
});

tap.test('supports namespace at same level as emit', (tap, done) => {
  assert.deepEqual(validateTestScript(`
scenarios:
  - engine: socketio
    flow:
      - namespace: "myOwnNamespace"
        emit:
          - "myChannel"
          - "hello"
          - "world"
    `), []);

  done();
});

tap.test(
  'supports response with its options at the same level as emit',
  (tap, done) => {
    assert.deepEqual(validateTestScript(`
scenarios:
  - engine: socketio
    flow:
      - namespace: "myOwnNamespace"
        emit:
          channel: myChannel
          data: Hello world
        response:
          channel: "myChannel"
          data: "hello world"
          match:
            json: "$.something"
            value: "abc"
    `), []);

    done();
  }
);

tap.test(
  'supports acknowledge with its options at the same level as emit',
  (tap, done) => {
    assert.deepEqual(validateTestScript(`
scenarios:
  - engine: socketio
    flow:
      - namespace: "myOwnNamespace"
        emit:
          channel: myChannel
          data: Hello world
        acknowledge:
          data: "hello world"
          capture:
            json: "$"
            as: "myJson"
    `), []);

    done();
  }
);

tap.test('allows general flow properties', (tap, done) => {
  assert.deepEqual(validateTestScript(`
scenarios:
  - engine: socketio
    flow:
      - emit:
          channel: myChannel
          data: Hello world
      - think: 5
      - log: Debug here
    `), []);

  done();
});

tap.test('supports HTTP flow properties for "socketio" engine', (tap, done) => {
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

  assert.deepEqual(errors, []);
  done();
});
