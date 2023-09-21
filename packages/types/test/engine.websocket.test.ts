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
