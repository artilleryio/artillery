/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const test = require('ava');
const path = require('path');
const EventEmitter = require('events');
const shelljs = require('shelljs');
const dogapi = require('dogapi');
const debug = require('debug')('test');
const assert = require('assert');

const testId = `test${process.hrtime()[0]}${process.hrtime()[1]}`;

debug({ testId });

assert(process.env.DD_API_KEY, 'DD_API_KEY must be set');
assert(process.env.DD_APP_KEY, 'DD_APP_KEY must be set');

test('Basic interface checks', async t => {
  const script = {
    config: {
      plugins: {
        'publish-metrics': [{
          type: 'datadog',
          apiKey: '123'
        }]
      }
    },
    scenarios: []
  };

  const events = new EventEmitter();
  const PublishMetrics = require('../index');
  const plugin = new PublishMetrics.Plugin(script, events);
  t.true(typeof PublishMetrics.Plugin === 'function');
});
