/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const debug = require('debug')('util:aws:getSSOCredentials');
const { fromSSO } = require('@aws-sdk/credential-providers');

module.exports = getSSOCredentials;

// If SSO is in use and we can acquire fresh credentials, return [true, credentials object]
// If SSO is in use, but the session is stale, we return [true, {}]
// If SSO is not in use we return [false, null]

async function getSSOCredentials() {
  debug('Trying AWS SSO');
  try {
    const credentials = await fromSSO()();
    return [true, credentials];
  } catch (err) {
    debug(err);

    if (/SSO.+expired/.test(err.message)) {
      return [true, null];
    } else {
      return [false, null];
    }
  }
}
