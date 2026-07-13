/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { test } = require('node:test');
const assert = require('node:assert');
var template = require('@artilleryio/int-commons').engine_util.template;

let contextFuncs;

var bigObject = require('./large-json-payload-7.2mb.json');

// TODO:
// variables that aren't defined
// functions that aren't defined

var emptyContext = { vars: {} };

const __tap = require('node:test');
// Modules under test are ES modules - load before tests run
__tap.before(async () => {
  ({ contextFuncs } = await import('../../lib/runner.ts'));
});

test('strings - templating a plain string should return the same string', (t, done) => {
  assert.ok(template('string', emptyContext) === 'string', '');
  assert.ok(template('string {}', emptyContext) === 'string {}', '');
  done();
});

test('strings - variables can be substituted', (t, done) => {
  assert.ok(template('hello {{name}}', { vars: { name: 'Hassy' } }) === 'hello Hassy', '');
  assert.ok(template('hello {{name}}', emptyContext) === 'hello undefined', '');
  done();
});

// test('strings - huge strings are OK', function (t) {
//   const s1 = JSON.stringify(bigObject);
//   const start = Date.now();
//   const s2 = template(s1, { vars: {} });
//   const end = Date.now();
//   assert.deepEqual(s1, s2);
//   console.log('# delta:', end - start);
//   assert.ok(end - start < 30, 'templated in <30ms');
//   t.end();
// });

test('arrays can be substituted', (t, done) => {
  assert.deepEqual([1, { foo: 'bar' }, null, { foo: null }], template([1, { '{{k}}': '{{v}}' }, null, { foo: null }], {
      vars: { k: 'foo', v: 'bar' }
    }));

  assert.deepEqual(template(['{{name}}', [1, 2, '{{ count }}', {}, { '{{count}}': 3 }]], {
      vars: { name: 'Hassy', count: 'three' }
    }), ['Hassy', [1, 2, 'three', {}, { three: 3 }]], '');

  assert.deepEqual(template(['{{ nullVar }}', '{{ undefinedVar }}'], {
      vars: { nullVar: null, undefinedVar: undefined }
    }), [null, undefined]);

  assert.deepEqual(template(['hello {{name}}'], emptyContext), ['hello undefined'], '');

  done();
});

test('buffers - returned as they are', (t, done) => {
  assert.deepEqual(template(Buffer.from('hello world'), { vars: {} }), Buffer.from('hello world'));
  done();
});

test('buffers - huge buffers are OK', (t, done) => {
  const b1 = Buffer.from(JSON.stringify(bigObject));
  const start = Date.now();
  const b2 = template(b1, { vars: {} });
  const end = Date.now();
  assert.deepEqual(b1, b2);
  console.log('# delta:', end - start);

  const expectedMaxTime = process.env.GITHUB_ACTIONS ? 15 : 10;
  const timeTaken = end - start;
  assert.ok(timeTaken < expectedMaxTime, `expected to be templated in <${expectedMaxTime}ms. took ${timeTaken}ms}`);

  done();
});

test('objects can be substituted', (t, done) => {
  assert.deepEqual(template(
      { '{{ k1 }}': '{{ v1 }}', '{{ k2 }}': '{{ v2 }}', foo: null },
      { vars: { k1: 'name', v1: 'Hassy', k2: 'nickname', v2: 'Has' } }
    ), { name: 'Hassy', nickname: 'Has', foo: null }, '');
  assert.deepEqual(template(
      { '{{ k1 }}': '{{ v1 }}', '{{ k2 }}': 'hello {{ v2 }}' },
      { vars: { k1: 'name', v1: 'Hassy', k2: 'nickname' } }
    ), { name: 'Hassy', nickname: 'hello undefined' }, '');
  assert.deepEqual(template(
      { '{{ k1 }}': '{{ v1 }}', '{{ k2 }}': '{{ v2 }}' },
      { vars: { k1: 'k1', v1: null, k2: 'k2', v2: undefined } }
    ), { k1: null, k2: undefined });
  done();
});

test('nested objects can be substituted', (t, done) => {
  assert.deepEqual(template(
      {
        '{{ k1 }}': [
          '{{ v1 }}',
          {
            '{{ k3 }}': '{{ v3 }}'
          }
        ],
        '{{ k2 }}': '{{ v2 }}'
      },

      {
        vars: {
          k1: 'name',
          v1: 'Hassy',
          k2: 'nickname',
          v2: 'Has',
          k3: 'lastname',
          v3: 'Veldstra'
        }
      }
    ), { name: ['Hassy', { lastname: 'Veldstra' }], nickname: 'Has' }, '');
  done();
});

test('template functions', (t, done) => {
  const context = {
    funcs: contextFuncs,
    vars: { greeting: 'hello', foo: 'bar' }
  };

  const templateRandomString = template('{{ $randomString( ) }}', context);
  assert.ok(templateRandomString.length > 0, `templated string should have length > 0. got ${templateRandomString}`);

  const templateMultipleFunctions = template(
    '{{ $randomString(3) }} hello world {{ $randomString(10) }} {{ $randomNumber(   100, 900) }}',
    context
  );
  assert.ok(templateMultipleFunctions.length === 30, `multiple template functions may be used. got ${templateMultipleFunctions} (length ${templateMultipleFunctions.length})`);

  const templateFuncAndVarSubstitutions = template(
    '{{ greeting}} {{ $randomString(5) }}! {{ foo }}',
    context
  );
  assert.ok(templateFuncAndVarSubstitutions.length === 16, `functions and variable substitutions may be mixed. got ${templateFuncAndVarSubstitutions} (length ${templateFuncAndVarSubstitutions.length})`);

  done();
});

test('keys with periods retain their structure', (t, done) => {
  assert.ok(template({ 'hello.world': true }, {})['hello.world'] === true, 'keys with periods are preserved');

  const nestedTemplate = template(
    { hello: { world: { 'hello.world': true } } },
    {}
  );

  assert.ok(nestedTemplate.hello.world['hello.world'] === true &&
      nestedTemplate['hello.world'] === undefined, 'the template only creates it at the end');

  done();
});
