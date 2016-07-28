'use strict';

const test = require('tape');
const runner = require('../lib/runner').runner;
const L = require('lodash');
const csv = require('csv-parse');
const fs = require('fs');
const path = require('path');

let xmlCapture = null;
try {
  xmlCapture = require('artillery-xml-capture');
} catch (e) {

}

test('Capture - headers', (t) => {
  const fn = './scripts/captures-header.json';
  const script = require(fn);
  let ee = runner(script);
  ee.on('done', function(report) {
    // This will fail if header capture isn't working
    t.assert(!report.codes[403], 'No unauthorized responses');
    t.assert(report.codes[200] > 0, 'Successful responses');
    t.end();
  });
  ee.run();
});



test('Capture - JSON', (t) => {
  const fn = './scripts/captures.json';
  const script = require(fn);
  const data = fs.readFileSync(path.join(__dirname, 'pets.csv'));
  csv(data, function(err, parsedData) {
    if (err) {
      t.fail(err);
    }

    let ee = runner(script, parsedData, {});

    ee.on('done', function(report) {
      let c200 = report.codes[200];
      let c201 = report.codes[201];
      let c404 = report.codes[404];
      let cond = c201 * 2 === c200 + c404;
      t.assert(cond,
               'There should be a 200 and a 404 for every 201');
      if (!cond) {
        console.log('200: %s; 201: %s; 404: %s', c200, c201, c404);
      }
      t.end();
    });

    ee.run();
  });
});

test('Capture - XML', (t) => {
  if (!xmlCapture) {
    console.log('artillery-xml-capture does not seem to be installed, skipping XML capture test.');
    t.assert(true);
    return t.end();
  }

  const fn = './scripts/captures2.json';
  const script = require(fn);
  const data = fs.readFileSync(path.join(__dirname, 'pets.csv'));
  csv(data, function(err, parsedData) {
    if (err) {
      t.fail(err);
    }

    let ee = runner(script, parsedData, {});

    ee.on('done', function(report) {
      t.assert(report.codes[200] > 0, 'Should have a few 200s');
      t.assert(report.codes[404] === undefined, 'Should have no 404s');
      t.end();
    });

    ee.run();
  });
});

test('Capture - Random value from array', (t) => {
  const fn = './scripts/captures_array_random.json';
  const script = require(fn);
  let ee = runner(script);

  ee.on('done', (report) => {
    t.assert(report.codes[200] > 0, 'Should have a few 200s');
    t.assert(report.codes[404] === undefined, 'Should have no 404s');
    t.end();
  });

  ee.run();
});

test('Capture - RegExp', (t) => {
  const fn = './scripts/captures-regexp.json';
  const script = require(fn);
  let ee = runner(script);
  ee.on('done', (report) => {
      let c200 = report.codes[200];
      let c201 = report.codes[201];
      let c404 = report.codes[404];
      let cond = c201 * 2 === c200 + c404;
      t.assert(cond,
               'There should be a 200 and a 404 for every 201');
      if (!cond) {
        console.log('200: %s; 201: %s; 404: %s', c200, c201, c404);
      }
      t.end();
  });

  ee.run();
});
