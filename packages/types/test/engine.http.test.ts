import * as tap from 'node:test';
import assert from 'node:assert';
import { validateTestScript } from './helpers.ts';

tap.test(
  'uses "http" engine when no explicit scenario engine is provided',
  (tap, done) => {
    assert.deepEqual(validateTestScript(`
scenarios:
  - name: My HTTP scenario
    flow:
      - get:
          url: /resource
      - think: 5
`), []);

    //TODO: review this test if we decide if to allow arbitrary properties (although on this one, it depends on the defaulting bug too)
    //     assert.ok(//       validateTestScript(`
    // scenarios:
    //   - flow:
    //       - send: Oops, not WebSocket!
    // `).length > 0
    //     );

    done();
  });

tap.test('understands explicit "http" scenario engine', (tap, done) => {
  assert.deepEqual(validateTestScript(`
scenarios:
  - name: My HTTP scenario
    engine: http
    flow:
      - get:
          url: /resource
      - think: 5
`), []);

  done();
});
