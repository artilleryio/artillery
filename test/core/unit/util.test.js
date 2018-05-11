/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const test = require('tape');
const L = require('lodash');
const jitter = require('../../../core/lib/jitter').jitter;
const util = require('../../../core/lib/engine_util');

test('jitter', function(t) {
  t.assert(jitter(1000) === 1000, 'Number and no other params should return the number');
  t.assert(jitter('1000') === '1000', 'String that is not a template and no other params should return the string');

  let fails1 = 0;
  for(let i = 0; i < 100; i++) {
    let largeDeviation = jitter('1000:5000');
    if (largeDeviation < 0) {
      t.assert(false, `largeDeviation is ${largeDeviation}; expected >= 0`);
      fails1++;
    }
  }
  if (fails1 === 0) {
    t.assert(true, 'Result should be >= 0');
  }

  let fails2 = 0;
  for(let i = 0; i < 100; i++) {
    let percentJitter = jitter('5000:20%');
    if (percentJitter < 4000 || percentJitter > 6000) {
      t.assert(false, `percentJitter is ${percentJitter}; expected >=4000 <=6000`);
      fails2++;
    }
  }
  if (fails2 === 0) {
    t.assert(true, 'Percentage-based jitter should be within bounds');
  }

  t.end();
});

test('loop - error handling', function(t) {
  let steps = [
    function(context, next) {
      return next(null, context);
    },
    function(context, next) {
      if (context.vars.$loopCount === 5) {
        return next(new Error('ESOMEERR'), context);
      } else {
        return next(null, context);
      }
    }
  ];
  let loop = util.createLoopWithCount(10, steps, { });
  loop({ vars: {} }, function(err, context) {
    t.assert(
      typeof err === 'object' && err.message === 'ESOMEERR',
      'Errors are returned normally from loop steps');
    t.end();
  });
});

test('rendering variables', function(t) {
  let str = 'Hello {{ name }}, hope your {{{ day }}} is going great!';
  let vars = {
    name: 'Hassy',
    day: 'Friday'
  };

  t.assert(
    util._renderVariables(str, vars) === 'Hello Hassy, hope your Friday is going great!',
    'Variables are substituted with either double or triple curly braces');

  t.assert(
    util._renderVariables('{{ s }} - {{ s }} {}', { s: 'foo' }) === 'foo - foo {}',
    'Multiple instances of a variable get replaced');

  t.assert(
    util._renderVariables(' {{   foo}} ', { foo: 'bar' }) === ' bar ',
    'Whitespace inside templates is not significant');

  t.assert(
    util._renderVariables('Hello {{ name }}', { foo: 'bar', day: 'Sunday' }) === 'Hello ',
    'Undefined variables get replaced with an empty string');

  t.assert(
    util._renderVariables('', { foo: 'bar', name: 'Hassy', color: 'red' }) === '',
    'Empty string produces an empty string');

  t.assert(
    util._renderVariables('Hello world!', { foo: 'bar', name: 'Hassy', color: 'red' }) === 'Hello world!',
    'String with no templates produces itself');

  t.end();
});
