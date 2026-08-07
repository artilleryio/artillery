/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import _ from 'lodash';

// A payload row as parsed from CSV: an array of field values.
type PayloadRow = unknown[];

interface PayloadSpec {
  name?: string;
  loadAll?: boolean;
  fields?: string[];
  [key: string]: any;
}

export type PayloadReader = (data: PayloadRow[]) => unknown;

export default function createReader(
  order?: string,
  spec?: PayloadSpec
): PayloadReader {
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

function createSequencedReader(): PayloadReader {
  let i = 0;
  return (data) => {
    const result = data[i];
    if (i < data.length - 1) {
      i++;
    } else {
      i = 0;
    }
    return result;
  };
}

function createEverythingReader(spec: PayloadSpec): PayloadReader {
  let parsedData: Array<Record<string, unknown>> | PayloadRow[] | undefined;

  return (data) => {
    if (!parsedData) {
      const parsed: Array<Record<string, unknown>> = [];

      // Parse the row into an object based on the fields spec
      if (spec.fields && spec.fields.length > 0) {
        for (const row of data) {
          const o: Record<string, unknown> = {};
          for (let i = 0; i < spec.fields.length; i++) {
            const fieldName = spec.fields[i];
            o[fieldName] = row[i];
          }
          parsed.push(o);
        }
        parsedData = parsed;
      } else {
        // Otherwise just return the array of rows
        parsedData = data;
      }
    }

    return parsedData;
  };
}

function createRandomReader(): PayloadReader {
  return (data) => data[Math.max(0, _.random(0, data.length - 1))];
}
