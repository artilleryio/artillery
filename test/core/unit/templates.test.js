/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

var test = require('tape');
var template = require('../../../core/lib/engine_util').template;

// TODO:
// plain strings
// string with a {{}}
// string with multiple {{}}s
// string with a function
// string with multiple functions
// string with a function and a {{}}
// same but for an object

// variables that aren't defined
// functions that aren't defined

var emptyContext = { vars: {} };

test('templating a plain string should return the same string', function(t) {
  t.assert(template('string', emptyContext) === 'string', '');
  t.assert(template('string {}', emptyContext) === 'string {}', '');
  t.end();
});

test.test('variables can be substituted', function(t) {
  t.assert(template('hello {{name}}', { vars: { name: 'Hassy'} }) === 'hello Hassy', '');
  t.assert(template('hello {{name}}', emptyContext) === 'hello undefined', '');
  t.end();
});

test.test('arrays can be substituted', function(t) {
  t.same(template(['{{name}}', [1, 2, '{{ count }}', {}, {'{{count}}': 3}]], { vars: { name: 'Hassy', count: 'three'} }),  [ 'Hassy', [1,2,'three', {}, {'three': 3}] ], '');
  t.same(template(['hello {{name}}'], emptyContext),  ['hello undefined'], '');
  t.end();
});

test.test('hashes can be substituted', function(t) {
  t.same(template({'{{ k1 }}': '{{ v1 }}', '{{ k2 }}': '{{ v2 }}'}, { vars: { k1: 'name', v1: 'Hassy', k2: 'nickname', v2: 'Has'} }),  {name: 'Hassy', nickname: 'Has'}, '');
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
