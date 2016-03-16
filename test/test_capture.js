'use strict';

const test = require('tape');
const runner = require('../lib/runner').runner;
const L = require('lodash');
const csv = require('csv-parse');
const fs = require('fs');
const path = require('path');

test('Capture - JSON', (t) => {
  const fn = './scripts/captures.json';
  const script = require(fn);
  const data = fs.readFileSync(path.join(__dirname, 'pets.csv'));
  csv(data, function(err, parsedData) {
    if (err) {
      t.fail(err);
    }

    let ee = runner(script, parsedData, {});

    ee.on('done', function(stats) {
      let c200 = stats.aggregate.codes[200];
      let c201 = stats.aggregate.codes[201];
      let c404 = stats.aggregate.codes[404];
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
  const fn = './scripts/captures2.json';
  const script = require(fn);
  const data = fs.readFileSync(path.join(__dirname, 'pets.csv'));
  csv(data, function(err, parsedData) {
    if (err) {
      t.fail(err);
    }

    let ee = runner(script, parsedData, {});

    ee.on('done', function(stats) {
      t.assert(stats.aggregate.codes[200] > 0, 'Should have a few 200s');
      t.assert(stats.aggregate.codes[404] === undefined, 'Should have no 404s');
      t.end();
    });

    ee.run();
  });
});

test('Capture - RegExp', (t) => {
  const fn = './scripts/captures-regexp.json';
  const script = require(fn);
  let ee = runner(script);
  ee.on('done', (stats) => {
      let c200 = stats.aggregate.codes[200];
      let c201 = stats.aggregate.codes[201];
      let c404 = stats.aggregate.codes[404];
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
