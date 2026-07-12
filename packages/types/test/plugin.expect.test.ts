import * as tap from 'node:test';
import assert from 'node:assert';
import { validateTestScript } from './helpers.ts';

tap.test('validates expect plugin configuration options', (tap, done) => {
  assert.deepEqual(validateTestScript(`
config:
  target: http://127.0.0.1/api
  plugins:
    expect:
      outputFormat: json
      reportFailuresAsErrors: true
      expectDefault200: true
    `), []);

  done();
});

tap.test('validates expect plugin expectations on HTTP flow', (tap, done) => {
  assert.deepEqual(validateTestScript(`
scenarios:
  - flow:
      - get:
          url: /resource
          expect:
            statusCode: 200
            notStatusCode:
              - 301
              - 404
            hasHeader: x-my-header
            contentType: application/json
            hasProperty: foo
            notHasProperty: bar
            cdnHit: true
    `), []);

  done();
});

tap.test('supports array of expectations', (tap, done) => {
  assert.deepEqual(validateTestScript(`
scenarios:
  - flow:
      - post:
          url: /resource
          expect:
            - statusCode: 200
            - contentType: json
            - hasProperty: title
            - equals:
                - "From Dusk Till Dawn"
                - "{{ title }}"
  `), []);

  done();
});
