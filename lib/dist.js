/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const assert = require('assert');

module.exports = dist;

/**
 * Given M "things", distribute them between N peers as equally as possible
 */
function dist(m, n) {
  m = Number(m);
  n = Number(n);

  let result = [];

  if (m < n) {
    for (let i = 0; i < n; i++) {
      result.push(i < m ? 1 : 0);
    }
  } else {
    let baseCount = Math.floor(m / n);
    let extraItems = m % n;
    for(let i = 0; i < n; i++) {
      result.push(baseCount);
      if (extraItems > 0) {
        result[i]++;
        extraItems--;
      }
    }
  }
  assert(m === sum(result), `${m} === ${sum(result)}`);
  return result;
}

function sum(a) {
  let result = 0;
  for(let i = 0; i < a.length; i++) {
    result += a[i];
  }
  return result;
}

if (require.main === module) {
  console.log(dist(1, 4));
  console.log(dist(1, 10));
  console.log(dist(4, 4));
  console.log(dist(87, 4));
  console.log(dist(50, 8));
  console.log(dist(39, 20));
  console.log(dist(20, 4));
  console.log(dist(19, 4));
  console.log(dist(20, 3));
  console.log(dist(61, 4));
  console.log(dist(121, 4));
  console.log(dist(32, 3));
  console.log(dist(700, 31));
  console.log(dist(700, 29));
}
