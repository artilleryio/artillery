/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const DEFAULT_TIMEOUT_MS = 20 * 10000;
const DEFAULT_RETRY_LIMIT = 3;

let _got;
async function getGot() {
  if (!_got) {
    _got = (await import('got')).default;
  }
  return _got;
}

let _client;
async function getCloudHttpClient() {
  if (!_client) {
    const got = await getGot();
    _client = got.extend({
      timeout: { response: DEFAULT_TIMEOUT_MS },
      retry: {
        limit: DEFAULT_RETRY_LIMIT,
        methods: ['GET', 'POST', 'PUT']
      },
      throwHttpErrors: false
    });
  }
  return _client;
}

module.exports = { getCloudHttpClient, getGot };
