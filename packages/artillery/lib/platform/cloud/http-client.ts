/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { Got } from 'got';

const DEFAULT_RESPONSE_TIMEOUT_MS = 20 * 1000;
const DEFAULT_CONNECT_PHASE_TIMEOUT_MS = 10 * 1000;
const DEFAULT_RETRY_LIMIT = 3;

let _got: Got | undefined;
async function getGot(): Promise<Got> {
  if (!_got) {
    _got = (await import('got')).default;
  }
  return _got;
}

let _client: Got | undefined;
async function getCloudHttpClient(): Promise<Got> {
  if (!_client) {
    const got = await getGot();
    _client = got.extend({
      // The `response` timer only starts after the request has been
      // flushed, i.e. after DNS + TCP + TLS succeed. A blackholed
      // connection (e.g. a security group silently dropping SYNs to
      // app.artillery.io) is not covered by it and hangs until the OS
      // gives up (~2min per attempt on Linux). Bound each connection
      // phase explicitly so unreachable endpoints fail fast.
      timeout: {
        lookup: DEFAULT_CONNECT_PHASE_TIMEOUT_MS,
        connect: DEFAULT_CONNECT_PHASE_TIMEOUT_MS,
        secureConnect: DEFAULT_CONNECT_PHASE_TIMEOUT_MS,
        response: DEFAULT_RESPONSE_TIMEOUT_MS
      },
      retry: {
        limit: DEFAULT_RETRY_LIMIT,
        methods: ['GET', 'POST', 'PUT']
      },
      throwHttpErrors: false
    });
  }
  return _client;
}

export { getCloudHttpClient, getGot };
