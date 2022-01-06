/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

function httpHooks(script) {
  if (typeof process.env.LOCAL_WORKER_ID === 'undefined') {
    return;
  }

  script.scenarios.forEach(function (scenario) {
    scenario.afterResponse = [].concat(scenario.afterResponse || []);
    scenario.afterResponse.push('afterResponseFn');
  });

  script.config.processor.afterResponseFn = afterResponseFn;
  return this;
}

function afterResponseFn(req, res, userContext, events, done) {
  console.log('afterResponse hook');

  done();
}

module.exports.Plugin = httpHooks;
