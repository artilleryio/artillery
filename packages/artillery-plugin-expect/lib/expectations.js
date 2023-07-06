/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const debug = require('debug')('plugin:expect');
const template = global.artillery
  ? global.artillery.util.template
  : require('artillery/util').template;
const _ = require('lodash');
const jmespath = require('jmespath');

module.exports = {
  contentType: expectContentType,
  statusCode: expectStatusCode,
  notStatusCode: expectNotStatusCode,
  hasHeader: expectHasHeader,
  headerEquals: expectHeaderEquals,
  hasProperty: expectHasProperty,
  equals: expectEquals,
  matchesRegexp: expectMatchesRegexp,
  notHasProperty: expectNotHasProperty,
  cdnHit: expectCdnHit,
  jmespath: expectJmesPath,
  jpath: expectJmesPath
};

function expectJmesPath(expectation, body, req, res, userContext) {
  debug('check jmespath');
  debug('expectation', expectation);

  const result = {
    expected: expectation.description || expectation.jmespath,
    type: expectation.jmespath ? 'jmespath' : 'jpath'
  };

  if (body === null || typeof body !== 'object') {
    result.ok = false;
    result.got = `response body is not an object`;
  } else {
    result.ok = jmespath.search(
      body,
      expectation.jmespath || expectation.jpath
    );
    result.got = expectation.jmespath;
  }

  return result;
}

function expectCdnHit(expectation, body, req, res, userContext) {
  debug('check cdn');
  debug('expectation');

  let result = {
    ok: false,
    type: 'cdnHit',
    got: 'cache status header not found'
  };

  if (expectation.cdnHit) {
    result.expected = 'a cache header indicating a cache hit';
  } else {
    result.expected = 'a cache header indicating a cache miss';
  }

  const cacheHeaderNames = [
    'cf-cache-status', // CloudFlare
    'x-cache', // CloudFront, Fastly
    'x-vercel-cache' // Vercel
  ];

  const expectedHeaderValues = expectation.cdnHit ? ['hit', 'stale'] : ['miss'];

  for (const h of cacheHeaderNames) {
    if (res.headers[h]) {
      for (const headerValue of expectedHeaderValues) {
        if (res.headers[h].toLowerCase().startsWith(headerValue)) {
          result.ok = true;
          result.got = `${h} is ${res.headers[h]}`;
        }
      }
    }
  }

  return result;
}

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
  result.got = `${values.join(', ')}`;

  return result;
}

function expectHasHeader(expectation, body, req, res, userContext) {
  debug('hasHeader');

  const expectedHeader = template(expectation.hasHeader, userContext);

  debug(expectedHeader);

  let result = {
    ok: false,
    expected: expectedHeader,
    type: 'hasHeader'
  };

  if (res.headers[expectedHeader]) {
    result.ok = true;
    result.got = expectedHeader;
  } else {
    result.got = `response has no ${expectedHeader} header`;
  }

  return result;
}

function expectHeaderEquals(expectation, body, req, res, userContext) {
  debug('check header equals');
  debug('expectation:', expectation);

  const expected = template(expectation.headerEquals, userContext);
  let result = {
    ok: false,
    type: `header ${expected[0]} values equals`
  };

  debug('expected:', expected);
  if (res.headers[expected[0]]) {
    result.expected = expected[1];

    const valueToCheck = res.headers[expected[0]].toString();
    debug('valueToCheck = ' + valueToCheck);
    result.got = valueToCheck;

    if (valueToCheck === (expected[1] || '').toString()) {
      result.ok = true;
    }
  } else {
    result.expected = `response to have ${expected[0]} header`;
    result.got = `response has no ${expected[0]} header`;
  }

  return result;
}

function expectContentType(expectation, body, req, res, userContext) {
  debug('check contentType');
  debug('expectation:', expectation);
  debug('body:', body === null ? 'null' : typeof body);

  const expectedContentType = template(expectation.contentType, userContext);
  let result = {
    ok: false,
    expected: expectedContentType,
    type: 'contentType'
  };

  if (expectedContentType === 'json') {
    if (
      body !== null &&
      typeof body === 'object' &&
      (res.headers['content-type'].indexOf('application/json') !== -1 ||
        res.headers['content-type'].indexOf('application/problem+json') !==
          -1 ||
        res.headers['content-type'].indexOf('application/ld+json') !== -1)
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
    result.ok =
      res.headers['content-type'] &&
      res.headers['content-type'].toLowerCase() ===
        expectedContentType.toLowerCase();
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

  if (Array.isArray(expectedStatusCode)) {
    result.ok =
      expectedStatusCode.filter((x) => Number(res.statusCode) === Number(x))
        .length > 0;
  } else {
    result.ok = Number(res.statusCode) === Number(expectedStatusCode);
  }

  result.got = res.statusCode;
  return result;
}

function expectNotStatusCode(expectation, body, req, res, userContext) {
  debug('check notStatusCode');

  const expectedNotStatusCode = template(
    expectation.notStatusCode,
    userContext
  );

  let result = {
    ok: false,
    expected: `Status code different than ${expectedNotStatusCode}`,
    type: 'notStatusCode'
  };

  if (Array.isArray(expectedNotStatusCode)) {
    result.ok = !expectedNotStatusCode.filter(
      (x) => Number(res.statusCode) === Number(x)
    ).length;
  } else {
    result.ok = Number(res.statusCode) !== Number(expectedNotStatusCode);
  }

  result.got = res.statusCode;
  return result;
}

function checkProperty(
  expectationName,
  expectedProperty,
  expectedCondition,
  failureMessage,
  body
) {
  let result = {
    ok: false,
    expected: expectedProperty,
    type: expectationName
  };

  if (body === null || typeof body !== 'object') {
    result.got = `response body is not an object`;
    return result;
  }

  const isOk = expectedCondition(body, expectedProperty);
  result.ok = isOk;
  result.got = isOk ? expectedProperty : failureMessage;
  return result;
}

function expectHasProperty(expectation, body, req, res, userContext) {
  const expectationName = 'hasProperty';
  debug(`check ${expectationName}`);

  const expectedCondition = _.has;
  const expectedProperty = template(expectation[expectationName], userContext);
  const failureMessage = `response body has no ${expectedProperty} property`;
  return checkProperty(
    expectationName,
    expectedProperty,
    expectedCondition,
    failureMessage,
    body
  );
}

function expectNotHasProperty(expectation, body, req, res, userContext) {
  const expectationName = 'notHasProperty';
  debug(`check ${expectationName}`);

  const expectedCondition = (body, expectedProperty) =>
    !_.has(body, expectedProperty);
  const expectedProperty = template(expectation[expectationName], userContext);
  const failureMessage = `response body has ${expectedProperty} property`;
  return checkProperty(
    expectationName,
    expectedProperty,
    expectedCondition,
    failureMessage,
    body
  );
}

function expectMatchesRegexp(expectation, body, req, res, userContext) {
  debug('check valid regexp');
  const expectationName = 'matchesRegexp';

  const expectedRegexp = template(expectation[expectationName], userContext);

  let rx;
  let result;
  try {
    rx = new RegExp(expectedRegexp);
    const matches = new RegExp(rx).test(body);
    result = {
      ok: matches,
      expected: true,
      type: 'matchesRegexp',
      got: matches
    };
  } catch (rxErr) {
    result = {
      ok: false,
      expected: true,
      type: 'matchesRegexp',
      got: rxErr
    };
  }

  return result;
}
