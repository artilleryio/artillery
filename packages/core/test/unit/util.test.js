/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { test } = require('node:test');
const assert = require('node:assert');
const _L = require('lodash');
const jitter = require('@artilleryio/int-commons').jitter.jitter;
const util = require('@artilleryio/int-commons').engine_util;

test('jitter', (t, done) => {
  assert.strictEqual(jitter(1000), 1000, 'Number and no other params should return the number');
  assert.strictEqual(jitter('1000'), '1000', 'String that is not a template and no other params should return the string');

  let fails1 = 0;
  for (let i = 0; i < 100; i++) {
    const largeDeviation = jitter('1000:5000');
    if (largeDeviation < 0) {
      assert.ok(false, `largeDeviation is ${largeDeviation}; expected >= 0`);
      fails1++;
    }
  }
  if (fails1 === 0) {
    assert.ok(true, 'Result should be >= 0');
  }

  let fails2 = 0;
  for (let i = 0; i < 100; i++) {
    const percentJitter = jitter('5000:20%');
    if (percentJitter < 4000 || percentJitter > 6000) {
      assert.ok(false, `percentJitter is ${percentJitter}; expected >=4000 <=6000`);
      fails2++;
    }
  }
  if (fails2 === 0) {
    assert.ok(true, 'Percentage-based jitter should be within bounds');
  }

  done();
});

test('loop - error handling', (t, done) => {
  const steps = [
    (context, next) => next(null, context),
    (context, next) => {
      if (context.vars.$loopCount === 5) {
        return next(new Error('ESOMEERR'), context);
      } else {
        return next(null, context);
      }
    }
  ];
  const loop = util.createLoopWithCount(10, steps, {});
  loop({ vars: {} }, (err, _context) => {
    assert.ok(typeof err === 'object' && err.message === 'ESOMEERR', 'Errors are returned normally from loop steps');
    done();
  });
});

test('rendering variables', (t, done) => {
  const str = 'Hello {{ name }}, hope your {{{ day }}} is going great!';
  const vars = {
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

  assert.strictEqual(render(str, vars), 'Hello Hassy, hope your Friday is going great!', 'Variables are substituted with either double or triple curly braces');

  assert.strictEqual(render('{{ s }} - {{ s }} {}', { s: 'foo' }), 'foo - foo {}', 'Multiple instances of a variable get replaced');

  assert.strictEqual(render(' {{   foo}} ', { foo: 'bar' }), ' bar ', 'Whitespace inside templates is not significant');

  assert.strictEqual(render('Hello {{ name }}', { foo: 'bar', day: 'Sunday' }), 'Hello undefined', 'Undefined variables get replaced with undefined string');

  assert.strictEqual(render('', { foo: 'bar', name: 'Hassy', color: 'red' }), '', 'Empty string produces an empty string');

  assert.strictEqual(render('Hello world!', { foo: 'bar', name: 'Hassy', color: 'red' }), 'Hello world!', 'String with no templates produces itself');

  assert.strictEqual(render('{{ favoriteThings.color }}', vars), 'red', 'Object properties may be looked up with dots');

  assert.strictEqual(render('{{ favoriteThings.animals[0] }}', vars), 'dogs', 'Numeric indexes may be used for property lookups');

  assert.ok(render('{{favoriteThings.dayOfTheWeek}}', vars) === undefined, 'Non-existent property lookup returns undefined');

  assert.strictEqual(render('{{ favoriteThings.animals }}', vars), vars.favoriteThings.animals, 'Values returned from property lookups retain their type');

  assert.strictEqual(render('abc-{{ favoriteThings.animals[1] }}-123-{{ day }} 🐢🚀', vars), 'abc-cats-123-Friday 🐢🚀', 'Values returned from property lookups are interpolated as expected');

  assert.strictEqual(render('{{ zeroValue }}', vars), 0, 'Can render zero values');

  assert.strictEqual(render('{{ falseValue }}', vars), false, 'Can render false values');

  assert.strictEqual(render('{{ trueValue }}', vars), true, 'Can render true values');

  done();
});
