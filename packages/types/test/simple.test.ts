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

tap.test('supports base configurations (without scenarios)', (tap) => {
  tap.same(
    validateTestScript(`
  config:
    target: http://localhost:3000
    phases:
      - duration: 10
        rampTo: 50
    `),
    []
  );
  tap.end();
});

tap.test('supports top-level "before" and "after" scenarios', (tap) => {
  tap.same(
    validateTestScript(`
before:
  - engine: http
    flow:
      - post:
          url: /one
  - engine: ws
    flow:
      - send: Hello world
scenarios:
  - engine: http
    flow:
      - get:
          url: /two
    `),
    []
  );

  tap.same(
    validateTestScript(`
after:
  - engine: http
    flow:
      - post:
          url: /one
  - engine: ws
    flow:
      - send: Hello world
scenarios:
  - engine: http
    flow:
      - get:
          url: /two
    `),
    []
  );

  tap.same(
    validateTestScript(`
before:
  - engine: http
    flow:
      - post:
          url: /one
  - engine: ws
    flow:
      - send: Hello world
after:
  - engine: http
    flow:
      - post:
          url: /one
  - engine: ws
    flow:
      - send: Hello world
scenarios:
  - engine: http
    flow:
      - get:
          url: /two
    `),
    []
  );

  tap.end();
});

tap.test('treats "config.phases" as optional', (tap) => {
  tap.same(
    validateTestScript(`
config:
  target: http://127.0.0.1/api
scenarios:
  - engine: http
    flow:
      - get:
          url: /two
    `),
    []
  );

  tap.end();
});

tap.test('expects "payload.fields" to be an array', (tap) => {
  tap.same(
    validateTestScript(`
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
    `),
    []
  );

  tap.end();
});

tap.test('requires "name" if "payload.loadAll" is set to true', (tap) => {
  tap.same(
    validateTestScript(`
config:
  target: http://127.0.0.1/api
  payload:
    path: ./file.csv
    fields:
      - "username"
    loadAll: true
    name: "variable"
scenarios:
  - engine: http
    flow:
      - get:
          url: /two
    `),
    []
  );

  const errors = validateTestScript(`
  config:
    target: http://127.0.0.1/api
    payload:
      path: ./file.csv
      fields:
        - "username"
      loadAll: true
  scenarios:
    - engine: http
      flow:
        - get:
            url: /two
      `);
  tap.same(
    errors.find((error) => error.params?.missingProperty === 'name')?.message,
    `must have required property 'name'`
  );

  tap.end();
});

tap.test('supports custom scenario properties', (tap) => {
  tap.same(
    validateTestScript(`
scenarios:
  - engine: playwright
    flowFunction: checkPage
  `),
    []
  );
  tap.end();
});

tap.test('supports playwright engine configuration', (tap) => {
  // Must not error on known options.
  tap.same(
    validateTestScript(`
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
  `),
    []
  );

  tap.end();
});

tap.test('supports non-object plugin options', (tap) => {
  tap.same(
    validateTestScript(`
config:
  target: http://127.0.0.1/api
  plugins:
    publish-metrics:
      - one
      - two
    another-plugin:
      object: true
      nested:
        why: "not"
scenarios:
  - name: Blog
    engine: playwright
    testFunction: "helloFlow"
  `),
    []
  );

  tap.end();
});
