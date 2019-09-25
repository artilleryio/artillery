/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const debug = require('debug')('plugin:expect');
const chalk = require('chalk');
const template = global.artillery ? global.artillery.util.template : require('artillery/util').template;
const _ = require('lodash');

module.exports = {
  contentType: expectContentType,
  statusCode: expectStatusCode,
  hasProperty: expectHasProperty,
  notHasProperty: expectNotHasProperty,
  equals: expectEquals
};

function expectEquals(expectation, body, req, res, userContext) {
  debug('check equals');
  debug('expectation:', expectation);
  debug('body:', typeof body);

  let result = {
    ok: false,
    expected: 'all values to be equal',
    type: 'equals'
  };

  const values = _.map(expectation.equals, (str) => {
    return String(template(String(str), userContext));
  });

  const unique = _.uniq(values);
  result.ok = unique.length === 1;
  result.got = `${ values.join(', ' )}`;

  return result;
}

function expectContentType(expectation, body, req, res, userContext) {
  debug('check contentType');
  debug('expectation:', expectation);
  debug('body:', typeof body);

  const expectedContentType = template(expectation.contentType, userContext);
  let result = {
    ok: false,
    expected: expectedContentType,
    type: 'contentType'
  };

  if (expectedContentType === 'json') {
    if (
      typeof body === 'object' &&
      res.headers['content-type'].indexOf('application/json') !== -1
    ) {
      result.ok = true;
      result.got = 'json';
      return result;
    } else {
      if (body === null) {
        result.got = 'could not parse response body as JSON';
      } else {
        result.got = `content-type is ${res.headers['content-type']}`;
      }
      return result;
    }
  } else {
    result.ok = res.headers['content-type'] && res.headers['content-type'].toLowerCase() === expectedContentType.toLowerCase();
    result.got = res.headers['content-type'] || 'content-type header not set';
    return result;
  }
}

function expectStatusCode(expectation, body, req, res, userContext) {
  debug('check statusCode');

  const expectedStatusCode = template(expectation.statusCode, userContext);

  let result = {
    ok: false,
    expected: expectedStatusCode,
    type: 'statusCode'
  };

  result.ok = Number(res.statusCode) === Number(expectedStatusCode);
  result.got = res.statusCode;
  return result;
}

function checkProperty(expectationName, expectedProperty, expectedCondition, failureMessage, body) {
  let result = {
    ok: false,
    expected: expectedProperty,
    type: expectationName
  };

  if (typeof body === 'object') {
    if (expectedCondition(body, expectedProperty)) {
      result.ok = true;
      result.got = expectedProperty;
      return result;
    } else {
      result.got = failureMessage;
      return result;
    }
  } else {
    result.got = `response body is not an object`;
    return result;
  }
}

function expectHasProperty(expectation, body, req, res, userContext) {
  const expectationName = 'hasProperty';
  debug(`check ${expectationName}`);

  const expectedCondition = _.has;
  const expectedProperty = template(expectation[expectationName], userContext);
  const failureMessage = `response body has no ${expectedProperty} property`;
  return checkProperty(expectationName, expectedProperty, expectedCondition, failureMessage, body)
}

function expectNotHasProperty(expectation, body, req, res, userContext) {
  const expectationName = 'notHasProperty';
  debug(`check ${expectationName}`);

  const expectedCondition = (body, expectedProperty) => !_.has(body, expectedProperty);
  const expectedProperty = template(expectation[expectationName], userContext);
  const failureMessage = `response body has ${expectedProperty} property`;
  return checkProperty(expectationName, expectedProperty, expectedCondition, failureMessage, body);
}
