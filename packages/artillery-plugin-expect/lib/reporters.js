/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const debug = require('debug')('plugin:expect');
const metrics = require('datadog-metrics');

module.exports = {
  datadog: reportToDatadog
};

function reportToDatadog(requestExpectations, req, res, userContext) {
  const failedExpectations =
    requestExpectations.results.filter(res => !res.ok).length > 0;
  const event =
    failedExpectations === 0
      ? 'request_expectations_passed'
      : 'request_expectations_failed';
  userContext.expectationsPlugin.datadog.increment(event, 1, [
    `test-env:${userContext.vars.$env}`
  ]);
}
