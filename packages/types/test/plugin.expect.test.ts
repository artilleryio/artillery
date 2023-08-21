import * as tap from 'tap';
import { validateTestScript } from './helpers';

tap.test('validates expect plugin configuration options', (tap) => {
  tap.same(
    validateTestScript(`
config:
  target: http://127.0.0.1/api
  plugins:
    expect:
      outputFormat: json
      reportFailuresAsErrors: true
      expectDefault200: true
    `),
    []
  );

  tap.end();
});

tap.test('validates expect plugin expectations on HTTP flow', (tap) => {
  tap.same(
    validateTestScript(`
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
    `),
    []
  );

  tap.end();
});
