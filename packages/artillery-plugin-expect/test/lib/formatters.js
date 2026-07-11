const { test, beforeEach } = require('tap');

let expectations, formatters;

const __tap = require('tap');
// Modules under test are ES modules - load before tests run
__tap.before(async () => {
  expectations = await import('../../lib/expectations.ts');
  formatters = await import('../../lib/formatters.ts');
});

let loggedMessages = [];
const req = {
  url: 'http://localhost/api/a_path'
};

global.console = {
  log: (message) => {
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

  t.equal(loggedMessages.length, 0, 'No messages should be logged');
});

test('logs error with pretty formatter', async (t) => {
  const userContext = { vars: { expectedStatus: 200 } };
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

  t.not(loggedMessages.length, 0, 'Messages should be logged');
});
