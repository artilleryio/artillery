import * as tap from 'node:test';
import assert from 'node:assert';
import { validateTestScript } from './helpers.ts';

tap.test('validates a script with 1 phase and 1 http scenario', (tap, done) => {
  const errors = validateTestScript(`
  config:
    target: http://localhost:3000
    phases:
      - duration: 10
        arrivalRate: 5
        rampTo: 50
  scenarios:
    - engine: http
      flow:
        - get:
            url: /resource
  `);

  assert.deepEqual(errors, []);
  done();
});

tap.test('validates a script without "config" set', (tap, done) => {
  const errors = validateTestScript(`
scenarios:
  - engine: http
    flow:
      - get:
          url: /resource
    `);

  assert.deepEqual(errors, []);
  done();
});

tap.test('supports base configurations (without scenarios)', (tap, done) => {
  assert.deepEqual(validateTestScript(`
  config:
    target: http://localhost:3000
    phases:
      - duration: 10
        arrivalRate: 5
        rampTo: 50
    `), []);
  done();
});

tap.test('supports top-level "before" and "after" scenarios', (tap, done) => {
  assert.deepEqual(validateTestScript(`
before:
  flow:
    - send: Hello world
scenarios:
  - engine: http
    flow:
      - get:
          url: /two
    `), []);

  assert.deepEqual(validateTestScript(`
after:
  flow:
    - send: Hello world
scenarios:
  - engine: http
    flow:
      - get:
          url: /two
    `), []);

  assert.deepEqual(validateTestScript(`
before:
  flow:
    - post:
        url: /one
after:
  flow:
    - post:
        url: /one
scenarios:
  - engine: http
    flow:
      - get:
          url: /two
    `), []);

  done();
});

tap.test('treats "config.phases" as optional', (tap, done) => {
  assert.deepEqual(validateTestScript(`
config:
  target: http://127.0.0.1/api
scenarios:
  - engine: http
    flow:
      - get:
          url: /two
    `), []);

  done();
});

tap.test('expects "payload.fields" to be an array', (tap, done) => {
  assert.deepEqual(validateTestScript(`
config:
  target: http://127.0.0.1/api
  payload:
    path: ./file.csv
    fields:
      - "username"
      - "password"
scenarios:
  - engine: http
    flow:
      - get:
          url: /two
    `), []);

  done();
});

//TODO: fix this test when payload config is reviewed
// tap.test('requires "name" if "payload.loadAll" is set to true', (tap) => {
//   tap.same(
//     validateTestScript(`
// config:
//   target: http://127.0.0.1/api
//   payload:
//     path: ./file.csv
//     fields:
//       - "username"
//     loadAll: true
//     name: "variable"
// scenarios:
//   - engine: http
//     flow:
//       - get:
//           url: /two
//     `),
//     []
//   );

//   const errors = validateTestScript(`
//   config:
//     target: http://127.0.0.1/api
//     payload:
//       path: ./file.csv
//       fields:
//         - "username"
//       loadAll: true
//   scenarios:
//     - engine: http
//       flow:
//         - get:
//             url: /two
//       `);
//   tap.same(
//     errors.find((error) => error.params?.missingProperty === 'name')?.message,
//     `must have required property 'name'`
//   );

//   tap.end();
// });

tap.test('supports custom scenario properties', (tap, done) => {
  assert.deepEqual(validateTestScript(`
scenarios:
  - engine: playwright
    flowFunction: checkPage
  `), []);
  done();
});

tap.test('supports playwright engine configuration', (tap, done) => {
  // Must not error on known options.
  assert.deepEqual(validateTestScript(`
config:
  target: http://127.0.0.1/api
  engines:
    playwright:
      launchOptions:
        headless: true
      contextOptions:
        extraHTTPHeaders:
          x-my-header: true
scenarios:
  - name: Blog
    engine: playwright
    testFunction: "helloFlow"
  `), []);

  done();
});

tap.test('supports non-object plugin options', (tap, done) => {
  assert.deepEqual(validateTestScript(`
config:
  target: http://127.0.0.1/api
  plugins:
    another-plugin:
      object: true
      nested:
        why: "not"
scenarios:
  - name: Blog
    engine: playwright
    testFunction: "helloFlow"
  `), []);

  done();
});
