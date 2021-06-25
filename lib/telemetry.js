/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const { version: artilleryVersion } = require('../package.json');
const isCi = require('is-ci');

const noop = () => {};
const POSTHOG_TOKEN = '';

const telemetry = () => {
  const telemetryDisabled = ['true', '1'].includes(
    process.env.ARTILLERY_DISABLE_TELEMETRY
  );
  const debugEnabled = ['true', '1'].includes(
    process.env.ARTILLERY_TELEMETRY_DEBUG
  );

  const telemetry = {
    capture: noop,
    shutdown: noop,
  };

  if (telemetryDisabled) {
    return telemetry;
  }

  const capture = (client) => {
    return (event, data = {}) => {
      const eventPayload = {
        event,
        distinctId: 'artillery-core',
        properties: {
          ...data,
          version: artilleryVersion,
          os: process.platform,
          isCi,
          $ip: null,
        },
      };

      if (debugEnabled) {
        console.log(`Telemetry data: ${JSON.stringify(eventPayload)}`);

        return;
      }

      try {
        client.capture(eventPayload);
      } catch (err) {
        // fail silently
      }
    };
  };

  const shutdown = (client) => () => {
    try {
      client.shutdown();
    } catch (err) {
      // fail silently
    }
  };

  try {
    const PostHog = require('posthog-node');
    const client = new PostHog(POSTHOG_TOKEN);

    telemetry.capture = capture(client);
    telemetry.shutdown = shutdown(client);
  } catch (err) {
    // fail silently
  }

  return telemetry;
};

module.exports = telemetry;
