'use strict';

const test = require('tape');
const createReader = require('../../lib/readers');
const _ = require('lodash');

const payloadData = [
  ['dog', 'Leo'], ['cat', 'Bonnie'], ['pony', 'Tiki']
];

test('sequence payload reader should read in sequence', function(t) {
  const reader = createReader('sequence');
  const readElements = readPayloadData(reader);

  _.each(readElements, function(el, index) {
    t.assert(el === payloadData[index], 'read element matches payload element');
  });
  t.end();

});

test('random payload reader should pick at random', function(t) {
  const reader = createReader('random');
  const readElements = readPayloadData(reader);

  _.each(readElements, function(el) {
    t.assert(_.contains(payloadData, el), 'read element is one of payload elements');
  });
  t.end();
});

test('create reader should default to random', function(t) {
  const reader = createReader();
  const readElements = readPayloadData(reader);

  _.each(readElements, function(el) {
    t.assert(_.contains(payloadData, el), 'read element is one of payload elements');
  });
  t.end();
});

function readPayloadData(reader) {
  let readElements = [];
  readElements[0] = reader(payloadData);
  readElements[1] = reader(payloadData);
  readElements[2] = reader(payloadData);
  return readElements;
}
