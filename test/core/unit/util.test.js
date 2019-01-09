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
    day: 'Friday',
    favoriteThings: {
      color: 'red',
      food: 'tacos',
      day: 'Friday',
      animals: ['dogs', 'cats', 'ponies', 'donkeys']
    },
    zeroValue: 0,
    falseValue: false,
    trueValue: true
  };

  const render = util._renderVariables;

  t.assert(
    render(str, vars) === 'Hello Hassy, hope your Friday is going great!',
    'Variables are substituted with either double or triple curly braces');

  t.assert(
    render('{{ s }} - {{ s }} {}', { s: 'foo' }) === 'foo - foo {}',
    'Multiple instances of a variable get replaced');

  t.assert(
    render(' {{   foo}} ', { foo: 'bar' }) === ' bar ',
    'Whitespace inside templates is not significant');

  t.assert(
    render('Hello {{ name }}', { foo: 'bar', day: 'Sunday' }) === 'Hello undefined',
    'Undefined variables get replaced with undefined string');

  t.assert(
    render('', { foo: 'bar', name: 'Hassy', color: 'red' }) === '',
    'Empty string produces an empty string');

  t.assert(
    render('Hello world!', { foo: 'bar', name: 'Hassy', color: 'red' }) === 'Hello world!',
    'String with no templates produces itself');

  t.assert(
    render('{{ favoriteThings.color }}', vars) === 'red',
    'Object properties may be looked up with dots'
  );

  t.assert(
    render('{{ favoriteThings.animals[0] }}', vars) === 'dogs',
    'Numeric indexes may be used for property lookups'
  );

  t.assert(
    render('{{favoriteThings.dayOfTheWeek}}', vars) === '',
    'Non-existent property lookup returns an empty string'
  );

  t.assert(
    render('{{ favoriteThings.animals }}', vars) === vars.favoriteThings.animals,
    'Values returned from property lookups retain their type'
  );

  t.assert(
    render('abc-{{ favoriteThings.animals[1] }}-123-{{ day }} 🐢🚀', vars) === 'abc-cats-123-Friday 🐢🚀',
    'Values returned from property lookups are interpolated as expected'
  );

  t.assert(
    render('{{ zeroValue }}', vars) === 0,
    'Can render zero values'
  );

  t.assert(
    render('{{ falseValue }}', vars) === false,
    'Can render false values'
  );

  t.assert(
    render('{{ trueValue }}', vars) === true,
    'Can render true values'
  );

  t.end();
});
