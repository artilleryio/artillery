/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const _ = require('lodash');

module.exports = createReader;

function createReader(order) {
  if (order === 'sequence') {
    return createSequencedReader();
  }
  return createRandomReader();
}

function createSequencedReader() {
  let i = 0;
  return function(data) {
    let result = data[i];
    if (i < data.length - 1) {
      i++;
    } else {
      i = 0;
    }
    return result;
  };
}

function createRandomReader() {
  return function(data) {
    return data[Math.max(0, _.random(0, data.length - 1))];
  };
}
