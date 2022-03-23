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
  if (requestExpectations.results.length > 0) {
    artillery.log(`${chalk.blue('*', req.method, urlparse(req.url).path)} ${req.name ? '- ' + req.name : ''}`);
  }

  let hasFailedExpectations = false;

  requestExpectations.results.forEach(result => {
    artillery.log(
      `  ${result.ok ? chalk.green('ok') : chalk.red('not ok')} ${
        result.type
      } ${result.got} `
    );

    if (!result.ok) {
      artillery.log(`  expected: ${result.expected}`);
      artillery.log(`       got: ${result.got}`);

      hasFailedExpectations = true;
    }
  });

  if (hasFailedExpectations) {
    printExchangeContext(req, res, userContext);
  }
}

function printExchangeContext(req, res, userContext) {
  artillery.log(chalk.yellow('  Request params:'));
  artillery.log(prepend(req.url, '    '));
  artillery.log(prepend(JSON.stringify(req.json || '', null, 2), '    '));
  artillery.log(chalk.yellow('  Headers:'));
  Object.keys(res.headers).forEach(function(h) {
    artillery.log(`  ${h}: ${res.headers[h]}`);
  });
  artillery.log(chalk.yellow('  Body:'));
  artillery.log(prepend(String(JSON.stringify(res.body, null, 2)), '    '));

  artillery.log(chalk.yellow('  User variables:'));
  Object.keys(userContext.vars).filter(varName => varName !== '$processEnvironment').forEach(function(varName) {
    artillery.log(`    ${varName}: ${userContext.vars[varName]}`);
  });
}

function jsonPrint(requestExpectations, req, res, userContext) {
  artillery.log(JSON.stringify(requestExpectations));
}

function prettyError(requestExpectations, req, res, userContext) {
  if (requestExpectations.results.find(result => !result.ok) === undefined) {
    return;
  }
  prettyPrint(requestExpectations, req, res, userContext);
}

function prepend(text, str) {
  return text
    .split('\n')
    .map(function(line) {
      return str + line;
    })
    .join('\n');
}
