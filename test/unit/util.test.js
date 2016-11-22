/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const test = require('tape');
const L = require('lodash');
const jitter = require('../../lib/jitter').jitter;

test('jitter', function(t) {
  t.assert(jitter(1000) === 1000, 'Number and no other params should return the number');
  t.assert(jitter('1000') === '1000', 'String that is not a template and no other params should return the string');

  let fails1 = 0;
  for(var i = 0; i < 100; i++) {
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
  for(var i = 0; i < 100; i++) {
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
