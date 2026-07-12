import * as tap from 'node:test';
import assert from 'node:assert';
import { validateTestScript } from './helpers.ts';

tap.test('validates scenario flow using "websocket" scenario engine', (tap, done) => {
  assert.deepEqual(validateTestScript(`
scenarios:
  - engine: websocket
    flow:
      - send: Hello world
  `), []);

  done();
});

tap.test('supports general scenario flow properties', (tap, done) => {
  assert.deepEqual(validateTestScript(`
scenarios:
  - engine: websocket
    flow:
      - log: Debug here
      - think: 5
  `), []);

  done();
});

//TODO: review this test if we decide if to allow arbitrary properties
// tap.test(
//   'errors on http flow when using "websocket" scenario engine',
//   (tap) => {
//     tap.ok(
//       validateTestScript(`
// scenarios:
//   - name: My HTTP scenario
//     engine: websocket
//     flow:
//       - get:
//           url: /resource
// `).length > 0
//     );

//     tap.end();
//   }
// );
