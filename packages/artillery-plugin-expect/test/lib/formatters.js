'use strict';

const test = require('ava');
const expectations = require('../../lib/expectations');
const formatters = require('../../lib/formatters');

let loggedMessages = [];
let origConsole;
const req = {
    url: 'http://localhost/api/a_path'
};

global.artillery = {
  log: console.log.bind(console)
};

test.beforeEach(() => {
    loggedMessages = [];
    origConsole = artillery.log;
    artillery.log = (message) => loggedMessages.push(message);
});

test.afterEach(() => {
    artillery.log = origConsole;
});

test('does not log ok status', async t => {
    const userContext = {vars: {expectedStatus: 200}};
    const res = {statusCode: 200, headers: {'X-Test': 'A_VALUE'}};
    const result = expectations.statusCode(
        {statusCode: 200}, // expectation
        {}, // body
        req, // req
        res, // res
        userContext
    );

    formatters.prettyError.call(
        this,
        {results: [result]},
        req,
        res,
        userContext
    );

    t.true(loggedMessages.length === 0);
    t.pass();
});

test('logs error with pretty formatter', async t => {
    const userContext = {vars: {expectedStatus: 200}};
    const res = {statusCode: 403, headers: {'X-Test': 'A_VALUE'}};
    const result = expectations.statusCode(
        {statusCode: 200}, // expectation
        {}, // body
        req, // req
        res, // res
        userContext
    );

    formatters.prettyError.call(
        this,
        {results: [result]},
        req,
        res,
        userContext
    );

    t.true(loggedMessages.length !== 0);
    t.pass();
});
