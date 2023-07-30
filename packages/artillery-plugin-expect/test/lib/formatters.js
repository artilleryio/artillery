'use strict';

const { test, beforeEach } = require('tap');
const expectations = require('../../lib/expectations');
const formatters = require('../../lib/formatters');

let loggedMessages = [];
const req = {
  url: 'http://localhost/api/a_path',
  name: 'unicorns'
};

global.console = {
  log: function (message) {
    loggedMessages.push(message);
  }
};

beforeEach(() => {
  loggedMessages = [];
});

test('does not log ok status', async (t) => {
  const userContext = { vars: { expectedStatus: 200 } };
  const res = { statusCode: 200, headers: { 'X-Test': 'A_VALUE' } };
  const result = expectations.statusCode(
    { statusCode: 200 }, // expectation
    {}, // body
    req, // req
    res, // res
    userContext
  );

  formatters.prettyError.call(
    this,
    { results: [result] },
    req,
    res,
    userContext
  );

  t.equal(loggedMessages.length, 0);
});

test('logs error with pretty formatter', async (t) => {
  const userContext = { expectationsPlugin: {}, vars: { expectedStatus: 200 } };
  const res = { statusCode: 403, headers: { 'X-Test': 'A_VALUE' } };
  const result = expectations.statusCode(
    { statusCode: 200 }, // expectation
    {}, // body
    req, // req
    res, // res
    userContext
  );

  formatters.prettyError.call(
    this,
    { results: [result] },
    req,
    res,
    userContext
  );

  t.not(loggedMessages.length, 0);
});

test('uses request name instead of url', async (t) => {
  const userContext = {
    vars: { expectedStatus: 200 },
    expectationsPlugin: { useRequestNames: true }
  };
  const res = { statusCode: 200, headers: { 'X-Test': 'A_VALUE' } };
  const result = expectations.statusCode(
    { statusCode: 200 }, // expectation
    {}, // body
    req, // req
    res, // res
    userContext
  );

  formatters.pretty.call(this, { results: [result] }, req, res, userContext);

  t.true(loggedMessages[0].includes('unicorns'));
  t.pass();
});
