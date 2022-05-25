/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

var { test } = require('tap');
var template = require('../../../core/lib/engine_util').template;

const { contextFuncs } = require('../../../core/lib/runner');

var bigObject = require('./large-json-payload-7.2mb.json');

// TODO:
// variables that aren't defined
// functions that aren't defined

var emptyContext = { vars: {} };

test('strings - templating a plain string should return the same string', function (t) {
  t.ok(template('string', emptyContext) === 'string', '');
  t.ok(template('string {}', emptyContext) === 'string {}', '');
  t.end();
});

test('strings - variables can be substituted', function (t) {
  t.ok(
    template('hello {{name}}', { vars: { name: 'Hassy' } }) === 'hello Hassy',
    ''
  );
  t.ok(template('hello {{name}}', emptyContext) === 'hello undefined', '');
  t.end();
});

test('strings - huge strings are OK', function (t) {
  const s1 = JSON.stringify(bigObject);
  const start = Date.now();
  const s2 = template(s1, { vars: {} });
  const end = Date.now();
  t.same(s1, s2);
  console.log('# delta:', end - start);
  t.ok(end - start < 10, 'templated in <10ms');
  t.end();
});

test('arrays can be substituted', function (t) {
  t.same(
    [1, { foo: 'bar' }, null, { foo: null }],
    template([1, { '{{k}}': '{{v}}' }, null, { foo: null }], {
      vars: { k: 'foo', v: 'bar' }
    })
  );

  t.same(
    template(['{{name}}', [1, 2, '{{ count }}', {}, { '{{count}}': 3 }]], {
      vars: { name: 'Hassy', count: 'three' }
    }),
    ['Hassy', [1, 2, 'three', {}, { three: 3 }]],
    ''
  );

  t.same(
    template(['{{ nullVar }}', '{{ undefinedVar }}'], {
      vars: { nullVar: null, undefinedVar: undefined }
    }),
    [null, undefined]
  );

  t.same(template(['hello {{name}}'], emptyContext), ['hello undefined'], '');

  t.end();
});

test('buffers - returned as they are', function (t) {
  t.same(
    template(Buffer.from('hello world'), { vars: {} }),
    Buffer.from('hello world')
  );
  t.end();
});

test('buffers - huge buffers are OK', function (t) {
  const b1 = Buffer.from(JSON.stringify(bigObject));
  const start = Date.now();
  const b2 = template(b1, { vars: {} });
  const end = Date.now();
  t.same(b1, b2);
  console.log('# delta:', end - start);
  t.ok(end - start < 10, 'templated in <10ms');

  t.end();
});

test('objects can be substituted', function (t) {
  t.same(
    template(
      { '{{ k1 }}': '{{ v1 }}', '{{ k2 }}': '{{ v2 }}', foo: null },
      { vars: { k1: 'name', v1: 'Hassy', k2: 'nickname', v2: 'Has' } }
    ),
    { name: 'Hassy', nickname: 'Has', foo: null },
    ''
  );
  t.same(
    template(
      { '{{ k1 }}': '{{ v1 }}', '{{ k2 }}': 'hello {{ v2 }}' },
      { vars: { k1: 'name', v1: 'Hassy', k2: 'nickname' } }
    ),
    { name: 'Hassy', nickname: 'hello undefined' },
    ''
  );
  t.same(
    template(
      { '{{ k1 }}': '{{ v1 }}', '{{ k2 }}': '{{ v2 }}' },
      { vars: { k1: 'k1', v1: null, k2: 'k2', v2: undefined } }
    ),
    { k1: null, k2: undefined }
  );
  t.end();
});

test('nested objects can be substituted', function (t) {
  t.same(
    template(
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
    ),
    { name: ['Hassy', { lastname: 'Veldstra' }], nickname: 'Has' },
    ''
  );
  t.end();
});

test('template functions', (t) => {
  const context = {
    funcs: contextFuncs,
    vars: { greeting: 'hello', foo: 'bar' }
  };

  t.ok(
    template('{{ $randomString( ) }}', context).length > 0,
    'template functions may be used'
  );

  t.ok(
    template(
      '{{ $randomString(3) }} hello world {{ $randomString(10) }} {{ $randomNumber(   100, 900) }}',
      context
    ).length === 30,
    'multiple template functions may be used'
  );

  t.ok(
    template('{{ greeting}} {{ $randomString(5) }}! {{ foo }}', context)
      .length === 16,
    'functions and variable substitutions may be mixed'
  );

  t.end();
});

test('keys with periods retain their structure', (t) => {
  t.ok(
    template({ 'hello.world': true }, {})['hello.world'] === true,
    'keys with periods are preserved'
  );

  const nestedTemplate = template(
    { hello: { world: { 'hello.world': true } } },
    {}
  );

  t.ok(
    nestedTemplate.hello.world['hello.world'] === true &&
      nestedTemplate['hello.world'] === undefined,
    'the template only creates it at the end'
  );

  t.end();
});
