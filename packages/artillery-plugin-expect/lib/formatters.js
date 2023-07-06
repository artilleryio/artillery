/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const debug = require('debug')('plugin:expect');
const chalk = require('chalk');
const urlparse = require('url').parse;

module.exports = {
  pretty: prettyPrint,
  json: jsonPrint,
  prettyError: prettyError,
  silent: silent
};

function silent(requestExpectation, req, res, userContext) {
  return;
}

function prettyPrint(requestExpectations, req, res, userContext) {
  debug('prettyPrint formatter');
  if (requestExpectations.results.length > 0) {
    console.log(
      `${chalk.blue('*', req.method, urlparse(req.url).path)} ${
        req.name ? '- ' + req.name : ''
      }\n`
    );
  }

  let hasFailedExpectations = false;

  requestExpectations.results.forEach((result) => {
    console.log(
      `  ${result.ok ? chalk.green('ok') : chalk.red('not ok')} ${
        result.type
      } ${result.got} `
    );

    if (!result.ok) {
      console.log(`  expected: ${result.expected}`);
      console.log(`       got: ${result.got}`);

      hasFailedExpectations = true;
    }
  });

  if (hasFailedExpectations) {
    printExchangeContext(req, res, userContext);
  }
}

function printExchangeContext(req, res, userContext) {
  console.log(chalk.yellow('  Request params:'));
  console.log(prepend(req.url, '    '));
  console.log(prepend(JSON.stringify(req.json || '', null, 2), '    '));
  console.log(chalk.yellow('  Headers:'));
  Object.keys(res.headers).forEach(function (h) {
    console.log(`  ${h}: ${res.headers[h]}`);
  });
  console.log(chalk.yellow('  Body:'));
  console.log(res.body?.substring(0, 512));

  console.log(chalk.yellow('  User variables:'));
  Object.keys(userContext.vars)
    .filter(
      (varName) => varName !== '$processEnvironment' && varName !== '$env'
    )
    .forEach(function (varName) {
      console.log(`    ${varName}: ${userContext.vars[varName]}`);
    });
}

function jsonPrint(requestExpectations, req, res, userContext) {
  console.log(JSON.stringify(requestExpectations));
}

function prettyError(requestExpectations, req, res, userContext) {
  if (requestExpectations.results.find((result) => !result.ok) === undefined) {
    return;
  }
  prettyPrint(requestExpectations, req, res, userContext);
}

function prepend(text, str) {
  return text
    .split('\n')
    .map(function (line) {
      return str + line;
    })
    .join('\n');
}
