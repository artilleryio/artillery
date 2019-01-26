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

test.cb('Basic interface checks', t => {
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
  t.end();
});

test.cb('Check that metrics are written to Datadog', t => {
  const POLLING_INTERVAL_MS = 20 * 1e3;
  const TIMEOUT_MS = (parseInt(process.env.DD_QUERY_TIMEOUT_SEC) || 600) * 1e3;
  const i = setInterval(checkDatadog, POLLING_INTERVAL_MS);
  let elapsed = 0;

  dogapi.initialize({
    api_key: process.env.DD_API_KEY,
    app_key: process.env.DD_APP_KEY
  });

  const now = parseInt(new Date().getTime() / 1000);
  const oneHourAgo = now - (1 * 3600); // one hour ago
  const query = `avg:artillery.publish_metrics_plugin.latency.max{testid:${testId}}`;

  function checkDatadog() {
    dogapi.metric.query(oneHourAgo, now, query, (err, res) => {
      if (err) debug(err);
      if (res) debug(res);

      if (res && res.status === 'ok' && res.series.length > 0) {
        clearInterval(i);
        t.pass(`Metrics tagged with testId:${testId} are in Datadog`);
        t.end();
      } else {
        elapsed += POLLING_INTERVAL_MS;
        if (elapsed > TIMEOUT_MS) {
          clearInterval(i);
          t.fail(`Timed out waiting for metrics to be available in Datadog (testId: ${testId})`);
          t.end();
        }
      }
    });
  }
});

test.cb('Publish to Datadog via API', t => {
  const result = shelljs.exec(
    `${__dirname}/../node_modules/.bin/artillery run --config ${__dirname}/config-api.yaml ${__dirname}/scenario.yaml`,
    {
      env: {
        ARTILLERY_PLUGIN_PATH: path.resolve(__dirname, '..', '..'),
        PATH: process.env.PATH,
        DEBUG: 'plugin:*',
        DD_API_KEY: process.env.DD_API_KEY,
        TEST_ID: testId
      },
      silent: true
    }
  );

  const output = result.stdout;
  const debugOutput = result.stderr;

  // We expect Artillery to exit cleanly:
  t.true(result.code === 0);

  //
  // Some whitebox assertions:
  //
  t.true(debugOutput.match(/creating DatadogReporter/i) !== null);
  t.true(debugOutput.match(/datadog via HTTPS/i) !== null);
  t.true(debugOutput.match(/sending start event/i) !== null);
  t.true(debugOutput.match(/flushing metrics/i) !== null);

  t.end();
});
