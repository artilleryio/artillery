/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const _ = require('lodash');

module.exports = createReader;

function createReader(order, spec) {
  if (order === 'sequence') {
    return createSequencedReader();
  } else if (
    typeof order === 'undefined' &&
    typeof spec?.name !== 'undefined' &&
    spec?.loadAll === true
  ) {
    return createEverythingReader(spec);
  } else {
    // random
    return createRandomReader();
  }
}

function createSequencedReader() {
  let i = 0;
  return function (data) {
    let result = data[i];
    if (i < data.length - 1) {
      i++;
    } else {
      i = 0;
    }
    return result;
  };
}

function createEverythingReader(spec) {
  let parsedData;

  return function (data) {
    if (!parsedData) {
      parsedData = [];

      // Parse the row into an object based on the fields spec
      if (spec.fields?.length > 0) {
        for (const row of data) {
          let o = {};
          for (let i = 0; i < spec.fields.length; i++) {
            const fieldName = spec.fields[i];
            o[fieldName] = row[i];
          }
          parsedData.push(o);
        }
      } else {
        // Otherwise just return the array of rows
        parsedData = data;
      }
    }

    return parsedData;
  };
}

function createRandomReader() {
  return function (data) {
    return data[Math.max(0, _.random(0, data.length - 1))];
  };
}
