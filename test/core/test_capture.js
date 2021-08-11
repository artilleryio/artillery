'use strict';

const test = require('tape');
const runner = require('../../core').runner;
const L = require('lodash');
const csv = require('csv-parse');
const fs = require('fs');
const path = require('path');
const { SSMS } = require('../../core/lib/ssms');

let xmlCapture = null;
try {
  xmlCapture = require('artillery-xml-capture');
} catch (e) {

}

test('Capture - headers', (t) => {
  const fn = path.resolve(__dirname, './scripts/captures-header.json');
  const script = require(fn);
  runner(script).then(function(ee) {
    ee.on('done', function(nr) {
      const report = SSMS.legacyReport(nr).report();
      // This will fail if header capture isn't working
      t.assert(!report.codes[403], 'No unauthorized responses');
      t.assert(report.codes[200] > 0, 'Successful responses');
      ee.stop().then(() => {
        t.end();
      });

    });
    ee.run();
  });
});


test('Capture - JSON', (t) => {
  const fn = path.resolve(__dirname, './scripts/captures.json');
  const script = require(fn);
  const data = fs.readFileSync(path.join(__dirname, 'pets.csv'));
  csv(data, function(err, parsedData) {
    if (err) {
      t.fail(err);
    }

    runner(script, parsedData, {}).then(function(ee) {

      ee.on('done', function(nr) {
        const report = SSMS.legacyReport(nr).report();
        let c200 = report.codes[200];
        let c201 = report.codes[201];

        let cond = c201 === c200;

        t.assert(cond,
                 'There should be a 200 for every 201');
        if (!cond) {
          console.log(report);
          console.log('200: %s; 201: %s', c200, c201);
        }
        ee.stop().then(() => {
          t.end();
        });

      });

      ee.run();
    });
  });
});


test('Capture and save to attribute of an Object in context.vars - JSON', (t) => {
  const fn = path.resolve(__dirname, './scripts/captures3.json');
  const script = require(fn);
  const data = fs.readFileSync(path.join(__dirname, 'pets.csv'));
  csv(data, function(err, parsedData) {
    if (err) {
      t.fail(err);
    }

    runner(script, parsedData, {}).then(function(ee) {

      ee.on('done', function(nr) {
        const report = SSMS.legacyReport(nr).report();
        let c200 = report.codes[200];
        let c201 = report.codes[201];

        let cond = c201 === c200;

        t.assert(cond,
                 'There should be a 200 for every 201');
        if (!cond) {
          console.log('200: %s; 201: %s', c200, c201);
        }
        ee.stop().then(() => {
          t.end();
        });

      });

      ee.run();
    });
  });
});

test('Capture before test - JSON', (t) => {
  const fn = path.resolve(__dirname, './scripts/before_test.json');
  const script = require(fn);
  runner(script).then(function(ee) {
    ee.on('done', function(nr) {
      const report = SSMS.legacyReport(nr).report();
      let c200 = report.codes[200];
      let expectedAmountRequests = script.config.phases[0].duration * script.config.phases[0].arrivalRate;
      t.assert(c200 === expectedAmountRequests,
        'There should be ' + expectedAmountRequests + ' responses with status code 200; got ' + c200);

      let c201 = report.codes[201];
      t.assert(c201 === undefined, 'There should be no 201 response codes');

        ee.stop().then(() => {
          t.end();
        });

    });

    ee.run();
  });
});

test('Capture after test - JSON', (t) => {
  const fn = path.resolve(__dirname, './scripts/after_test.json');
  const script = require(fn);
  runner(script).then(function(ee) {
    ee.on('done', function(nr) {
      const report = SSMS.legacyReport(nr).report();
      let expectedAmountRequests = script.config.phases[0].duration * script.config.phases[0].arrivalRate;

      let c201 = report.codes[201];
      t.assert(c201 === expectedAmountRequests, `There should be ${expectedAmountRequests} response with status code 201; got ${c201}`);

      ee.stop().then(() => {
        t.end();
      });

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

  const fn = path.resolve(__dirname, './scripts/captures2.json');
  const script = require(fn);
  const data = fs.readFileSync(path.join(__dirname, 'pets.csv'));
  csv(data, function(err, parsedData) {
    if (err) {
      t.fail(err);
    }

    runner(script, parsedData, {}).then(function(ee) {

      ee.on('done', function(nr) {
        const report = SSMS.legacyReport(nr).report();
        t.assert(report.codes[200] > 0, 'Should have a few 200s');
        t.assert(report.codes[404] === undefined, 'Should have no 404s');
        ee.stop().then(() => {
          t.end();
        });

      });

      ee.run();
    });
  });
});

test('Capture - Random value from array', (t) => {
  const fn = path.resolve(__dirname, './scripts/captures_array_random.json');
  const script = require(fn);
  runner(script).then(function(ee) {

    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();
      t.assert(report.codes[200] > 0, 'Should have a few 200s');
      t.assert(report.codes[404] === undefined, 'Should have no 404s');
      ee.stop().then(() => {
        t.end();
      });

    });

    ee.run();
  });
});

test('Capture - RegExp', (t) => {
  const fn = path.resolve(__dirname, './scripts/captures-regexp.json');
  const script = require(fn);
  let ee = runner(script).then(function(ee) {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();
      let c200 = report.codes[200];
      let c201 = report.codes[201];
      let cond = c201 === c200;

      t.assert(cond,
               'There should be a 200 for every 201');
      if (!cond) {
        console.log('200: %s; 201: %s;', c200, c201);
      }
      ee.stop().then(() => {
        t.end();
      });

    });

    ee.run();
  });
});

test('Capture WS - JSON', (t) => {
  const fn = path.resolve(__dirname, './scripts/captures_ws.json');
  const script = require(fn);
  let ee = runner(script).then(function(ee) {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();
      if (report.errors) {
        const errors = Object.keys(report.errors);

        t.assert(errors.length === 0, "There should be no WS errors")
      }
      ee.stop().then(() => {
        t.end();
      });

    });

    ee.run();
  });
});
