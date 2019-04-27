/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const l = require('lodash');

module.exports = create;

// naive implementation of selection with replacement
function create(list) {
  let dist = l.reduce(list, function(acc, el, i) {
    for(let j = 0; j < el.weight * 100; j++) {
      acc.push(i);
    }
    return acc;
  }, []);

  return function() {
    let i = dist[l.random(0, dist.length - 1)];
    return [i, list[i]];
  };
}

function bench() {
  const items = [
    { weight: 0, value: 'zero' },
    { weight: 1, value: 'a' },
    { weight: 2, value: 'b' },
    { weight: 3, value: 'c' },
    { weight: 4, value: 'd' },
    { weight: 5, value: 'e' },
    { weight: 1, value: 'f' },
    { weight: 2, value: 'g' },
    { weight: 3, value: 'h' },
    { weight: 4, value: 'i' },
    { weight: 5, value: 'j' },
    { weight: 10, value: 'k' }
  ];

  const picker = create(items);

  const ITERS = Math.pow(10, 6);
  const startedAt = Date.now();

  const picks = l.map(
    l.range(ITERS),
    function() {
      let x = picker()[1];
      return x;
    });

  const delta = Date.now() - startedAt;
  console.log('ITERS = %s\ndelta = %s\nITERS/delta = %s',
    ITERS,
    delta,
    Math.round(ITERS / delta));

  const sumWeights = l.reduce(items, function(acc, item) {
    return acc + item.weight;
  }, 0);

  console.log('sumWeights = %s', sumWeights);

  l.each(items, function(p) {
    let count = l.filter(picks, {value: p.value}).length;
    console.log('Count of %s = %s (should be: %s\%, is: %s\%)',
      p.value,
      count,
      Math.round(p.weight / sumWeights * 1000) / 1000,
      Math.round(count / ITERS * 1000) / 1000);
  });
}

if (require.main === module) {
  bench();
}
