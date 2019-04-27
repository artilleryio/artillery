/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

var test = require('tape');
var template = require('../../../core/lib/engine_util').template;

const { contextFuncs } = require('../../../core/lib/runner');

var bigObject = require('./large-json-payload-7.2mb.json');
var mediumObject = require('./large-json-payload-669kb.json');

// TODO:
// variables that aren't defined
// functions that aren't defined

var emptyContext = { vars: {} };

test('strings - templating a plain string should return the same string', function(t) {
  t.assert(template('string', emptyContext) === 'string', '');
  t.assert(template('string {}', emptyContext) === 'string {}', '');
  t.end();
});

test.test('strings - variables can be substituted', function(t) {
  t.assert(template('hello {{name}}', { vars: { name: 'Hassy'} }) === 'hello Hassy', '');
  t.assert(template('hello {{name}}', emptyContext) === 'hello undefined', '');
  t.end();
});

test('strings - huge strings are OK', function(t) {
  const s1 = JSON.stringify(bigObject);
  const start = Date.now();
  const s2 = template(s1, { vars: {} });
  const end = Date.now();
  t.same(s1, s2);
  console.log('# delta:', end - start);
  t.assert(end - start < 10, 'templated in <10ms');
  t.end();
});

test.test('arrays can be substituted', function(t) {

  // console.log(
  //   template(
  //     [1, {'{{k}}': '{{v}}'}],
  //     {vars: {k: 'foo', v: 'bar' }})
  // );

  t.same(
    [1, {'foo': 'bar'}, null, { foo: null }],
    template(
      [1, {'{{k}}': '{{v}}'}, null, { foo: null }],
      {vars: {k: 'foo', v: 'bar' }})
  );

  t.same(template(['{{name}}', [1, 2, '{{ count }}', {}, {'{{count}}': 3}]], { vars: { name: 'Hassy', count: 'three'} }),  [ 'Hassy', [1,2,'three', {}, {'three': 3}] ], '');

  t.same(template(['hello {{name}}'], emptyContext),  ['hello undefined'], '');

  t.end();
});

test.test('buffers - returned as they are', function(t) {
  t.same(
    template(Buffer.from('hello world'), {vars: {}}),
    Buffer.from('hello world')
  );
  t.end();
});

test.test('buffers - huge buffers are OK', function(t) {
  const b1 = Buffer.from(JSON.stringify(bigObject));
  const start = Date.now();
  const b2 = template(b1, { vars: {}});
  const end = Date.now();
  t.same(b1, b2);
  console.log('# delta:', end - start);
  t.assert(end - start < 10, 'templated in <10ms');

  t.end();
});

test.test('objects can be substituted', function(t) {
  t.same(template({'{{ k1 }}': '{{ v1 }}', '{{ k2 }}': '{{ v2 }}', foo: null}, { vars: { k1: 'name', v1: 'Hassy', k2: 'nickname', v2: 'Has'} }),  {name: 'Hassy', nickname: 'Has', foo: null}, '');
  t.same(template({'{{ k1 }}': '{{ v1 }}', '{{ k2 }}': 'hello {{ v2 }}'}, { vars: { k1: 'name', v1: 'Hassy', k2: 'nickname'} }),  {name: 'Hassy', nickname: 'hello undefined'}, '');
  t.end();
});

test.test('nested objects can be substituted', function(t) {
  t.same(
    template(
      {'{{ k1 }}': [
        '{{ v1 }}',
        {
          '{{ k3 }}': '{{ v3 }}'
        }
      ],
       '{{ k2 }}': '{{ v2 }}'},

      { vars:
        { k1: 'name', v1: 'Hassy', k2: 'nickname', v2: 'Has', k3: 'lastname', v3: 'Veldstra'} }),
    {name: ['Hassy', {lastname: 'Veldstra'}], nickname: 'Has'},
    ''
  );
  t.end();
});

test.test('template functions', (t) => {
  const context = { funcs: contextFuncs, vars: { greeting: 'hello', foo: 'bar'} };

  t.assert(
    template('{{ $randomString( ) }}', context).length > 0,
    'template functions may be used');

  t.assert(
    template('{{ $randomString(3) }} hello world {{ $randomString(10) }} {{ $randomNumber(   100, 900) }}', context).length === 30,
    'multiple template functions may be used'
  );

  t.assert(
    template('{{ greeting}} {{ $randomString(5) }}! {{ foo }}', context).length === 16,
    'functions and variable substitutions may be mixed'
  );

  t.end();
});
