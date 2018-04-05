/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const debug = require('debug')('plugin:expect');

module.exports = {
  contentType: expectContentType,
  statusCode: expectStatusCode,
  hasProperty: expectHasProperty
};

function expectContentType(expectation, body, req, res, userContext) {
  debug('check contentType');
  debug('expectation:', expectation);
  debug('body:', typeof body);

  let result = {
    ok: false,
    expected: expectation.contentType,
    type: 'contentType'
  };

  if (expectation.contentType === 'json') {
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
    result.got = 'Expectations other than "json" are not supported yet';
    return result;
  }
}

function expectStatusCode(expectation, body, req, res, userContext) {
  debug('check statusCode');

  let result = {
    ok: false,
    expected: expectation.statusCode,
    type: 'statusCode'
  };

  result.ok = res.statusCode === expectation.statusCode;
  result.got = res.statusCode;
  return result;
}

function expectHasProperty(expectation, body, req, res, userContext) {
  debug('check hasProperty');

  let result = {
    ok: false,
    expected: expectation.hasProperty,
    type: 'hasProperty'
  };

  if (typeof body === 'object') {
    if (expectation.hasProperty in body) {
      result.ok = true;
      result.got = `${body[expectation.hasProperty]}`;
      return result;
    } else {
      result.got = `response body has no ${expectation.hasProperty} property`;
      return result;
    }
  } else {
    result.got = `response body is not an object`;
    return result;
  }
}
