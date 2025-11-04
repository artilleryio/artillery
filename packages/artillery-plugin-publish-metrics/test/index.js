/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { test } = require('tap');
const _path = require('node:path');
const EventEmitter = require('node:events');
const _shelljs = require('shelljs');
const _dogapi = require('dogapi');
const debug = require('debug')('test');
const _assert = require('node:assert');

const testId = `test${process.hrtime()[0]}${process.hrtime()[1]}`;

debug({ testId });

test('Basic interface checks', async (t) => {
  const script = {
    config: {
      plugins: {
        'publish-metrics': [
          {
            type: 'datadog',
            apiKey: '123',
            appKey: '456'
          }
        ]
      }
    },
    scenarios: []
  };

  const events = new EventEmitter();
  const PublishMetrics = require('../index');
  const _plugin = new PublishMetrics.Plugin(script, events);
  t.type(PublishMetrics.Plugin, 'function');
});
