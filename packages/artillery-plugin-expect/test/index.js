'use strict';

const test = require('ava');
const createDebug = require('debug');
const EventEmitter = require('events');

const debug = createDebug('expect-plugin:test');

const shelljs = require('shelljs');
const path = require('path');

//
// We only need this when running unit tests. When the plugin actually runs inside
// a recent version of Artillery, the appropriate object is already set up.
//
global.artillery = {
  util: {
    template: require('artillery/util').template
  }
};

test('Basic interface checks', async t => {
  const script = {
    config: {},
    scenarios: []
  };

  const ExpectationsPlugin = require('../index');
  const events = new EventEmitter();
  const plugin = new ExpectationsPlugin.Plugin(script, events);

  t.true(typeof ExpectationsPlugin.Plugin === 'function');
  t.true(typeof plugin === 'object');

  t.pass();
});

test('Expectation: statusCode', async (t) => {
  const expectations = require('../lib/expectations');

  const data = [
    // expectation - value received - user context - expected result
    [ '{{ expectedStatus }}', 200, { vars: { expectedStatus: 200 }}, true ],
    [ 200, 200, { vars: {}}, true ],
    [ '200', 200, { vars: {}}, true ],
    [ 200, '200', { vars: {}}, true ],
    [ '200', '200', { vars: {}}, true ],

    [ '{{ expectedStatus }}', 200, { vars: { expectedStatus: 202 }}, false ],
    [ '{{ expectedStatus }}', '200', { vars: {}}, false ],
    [ 301, '200', { vars: {}}, false ],
  ];

  data.forEach((e) => {
    const result = expectations.statusCode(
      { statusCode: e[0] }, // expectation
      {}, // body
      {}, // req
      { statusCode: e[1] }, // res
      e[2] // userContext
    );

    t.true(result.ok === e[3]);
  });
});

test('Expectation: validRegex', async (t) => {
  const expectations = require('../lib/expectations');

  const result = expectations.matchesRegexp(
    {matchesRegexp: "^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"},
    "ea91af53-a673-4ceb-999b-1ab0d247bd48", // body
    {}, // req
    {}, // res
    "" // userContext
  );

  t.true(result.ok === true);
});

test('Expectation: hasProperty', t => {
  const expectations = require('../lib/expectations');

  const data = [
    // expectation - body received - user context - expected result
    [ '{{ hasProperty }}', { someProperty: 'someValue'}, { vars: { hasProperty: "someProperty" }}, true ],
    [ 'someProperty', { someProperty: 'someValue'}, { vars: { }}, true ],
    [ '{{ hasProperty }}', { someOtherProperty: 'someValue'}, { vars: { hasProperty: "someProperty" }}, false ],
    [ 'someProperty', { someOtherProperty: 'someValue'}, { vars: { }}, false ],
    [ '{{ hasProperty }}', null, { vars: { hasProperty: "someProperty" }}, false ],
    [ 'someProperty', null, { vars: { }}, false ],
  ];

  data.forEach((e) => {
    const result = expectations.hasProperty(
      {hasProperty: e[0]},
      e[1], // body
      {}, // req
      { statusCode: 200 }, // res
      e[2]); // userContext
    t.true(result.ok === e[3]);
  });
});

test('Expectation: notHasProperty', t => {
  const expectations = require('../lib/expectations');

  const data = [
    // expectation - body received - user context - expected result
    [ '{{ notHasProperty }}', { someOtherProperty: 'someValue'}, { vars: { notHasProperty: "someProperty" }}, true ],
    [ 'someProperty', { someOtherProperty: 'someValue'}, { vars: { }}, true ],
    [ '{{ notHasProperty }}', { someProperty: 'someValue'}, { vars: { notHasProperty: "someProperty" }}, false ],
    [ 'someProperty', { someProperty: 'someValue'}, { vars: { }}, false ],
    [ '{{ notHasProperty }}', null, { vars: { notHasProperty: "someProperty" }}, false ],
    [ 'someProperty', null, { vars: { }}, false ],
  ];

  data.forEach((e) => {
    const result = expectations.notHasProperty(
      {notHasProperty: e[0]},
      e[1], // body
      {}, // req
      { statusCode: 200 }, // res
      e[2]); // userContext
    t.true(result.ok === e[3]);
  });
});

test('Expectation: contentType', async (t) => {
  const expectations = require('../lib/expectations');

  const data = [
    // expectation - body received - res.headers.content-type - user context - expected result
    [ '{{ expectedContentType }}', {}, 'application/json', { expectedContentType: 'json' }, true ],
    [ 'json', {}, 'application/json; charset=utf-8', {}, true ],
    [ 'json', {}, 'charset=utf-8; application/json', {}, true ],
    [ 'text/plain', 'string', 'text/plain', {}, true ],
    [ 'TEXT/PLAIN', 'string', 'text/plain', {}, true ],
    [ 'text/plain', 'string', 'TEXT/PLAIN', {}, true ],
    [ 'text/plain', {}, 'text/plain', {}, true ],

    [ 'text/plain', 'string', 'application/json', {}, false ],
    [ 'json', null, 'application/json', {}, false ],
    [ 'json', 'string', 'application/json', {}, false ],
  ];

  data.forEach((e) => {
    const result = expectations.contentType(
      { contentType: e[0] }, // expectation
      e[1], // body
      {}, // req
      { headers: { 'content-type': e[2] }}, // res
      { vars: e[3] } // userContext
    );

    t.true(result.ok === e[4]);
  });
});

test('Integration with Artillery', async (t) => {
  shelljs.env["ARTILLERY_PLUGIN_PATH"] = path.resolve(__dirname, '..', '..');
  shelljs.env["PATH"] = process.env.PATH;
  const result = shelljs.exec(
    `${__dirname}/../node_modules/.bin/artillery run --quiet ${__dirname}/pets-test.yaml`,
  {
    silent: true
  });

  const output = result.stdout;

  const EXPECTED_EXPECTATION_COUNT = 11;
  const actualCount = output.split('\n').filter((s) => {
    return s.startsWith('  ok') || s.startsWith('  not ok');
  }).length;

  if (EXPECTED_EXPECTATION_COUNT !== actualCount) {
    console.log('Artillery output:');
    console.log(output);
  }
  t.true(EXPECTED_EXPECTATION_COUNT === actualCount);

  t.true(output.indexOf('ok contentType json') > -1);
  t.true(output.indexOf('ok statusCode 404') > -1);
  t.true(result.code === 0);
});
