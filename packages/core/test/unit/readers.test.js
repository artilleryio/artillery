/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { test } = require('node:test');
const assert = require('node:assert');
let createReader;
const _ = require('lodash');

const __tap = require('node:test');
// Modules under test are ES modules - load before tests run
__tap.before(async () => {
  createReader = (await import('../../lib/readers.ts')).default;
});

const payloadData = [
  ['dog', 'Leo'],
  ['cat', 'Bonnie'],
  ['pony', 'Tiki']
];

test('sequence payload reader should read in sequence', (t, done) => {
  const reader = createReader('sequence');
  const readElements = readPayloadData(reader);

  _.each(readElements, (el, index) => {
    assert.strictEqual(el, payloadData[index], 'read element matches payload element');
  });
  done();
});

test('random payload reader should pick at random', (t, done) => {
  const reader = createReader('random');
  const readElements = readPayloadData(reader);

  _.each(readElements, (el) => {
    assert.ok(_.includes(payloadData, el), 'read element is one of payload elements');
  });
  done();
});

test('create reader should default to random', (t, done) => {
  const reader = createReader();
  const readElements = readPayloadData(reader);

  _.each(readElements, (el) => {
    assert.ok(_.includes(payloadData, el), 'read element is one of payload elements');
  });
  done();
});

function readPayloadData(reader) {
  const readElements = [];
  readElements[0] = reader(payloadData);
  readElements[1] = reader(payloadData);
  readElements[2] = reader(payloadData);
  return readElements;
}
