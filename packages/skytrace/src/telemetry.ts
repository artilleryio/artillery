/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { version: skytraceVersion } = require('../package.json');
const { isCI, name: ciName } = require('ci-info');
const chalk = require('chalk');
const debug = require('debug')('telemetry');

const POSTHOG_TOKEN = '_uzX-_WJoVmE_tsLvu0OFD2tpd0HGz72D5sU1zM2hbs';

const noop = () => {};

const notice = () => {
  console.log(
    'Anonymized telemetry is on. Learn more: https://skytrace.dev/docs/resources/core/telemetry.html'
  );
};

const isEnabled = () => {
  return typeof process.env.SKYTRACE_DISABLE_TELEMETRY === 'undefined';
};

const init = () => {
  const telemetryDisabled = !isEnabled();

  const debugEnabled =
    typeof process.env.SKYTRACE_TELEMETRY_DEBUG !== 'undefined';

  let telemetryDefaults = {};
  try {
    telemetryDefaults = JSON.parse(process.env.SKYTRACE_TELEMETRY_DEFAULTS);
  } catch (_err) {
    // fail silently
  }

  const telemetry: any = {
    capture: noop,
    shutdown: noop
  };

  const capture = (client) => {
    return (event, data: any = {}) => {
      let eventPayload: any;

      if (telemetryDisabled) {
        eventPayload = {
          event,
          distinctId: 'skytrace',
          properties: {
            $ip: 'not-collected'
          }
        };
      } else {
        eventPayload = {
          event,
          distinctId: data.distinctId || 'skytrace',
          properties: {
            ...data,
            version: skytraceVersion,
            os: process.platform,
            isCi: isCI,
            $ip: 'not-collected'
          }
        };

        eventPayload.properties = Object.assign(
          eventPayload.properties,
          telemetryDefaults
        );

        if (isCI) {
          eventPayload.properties.ciName = ciName;
        }
      }

      if (debugEnabled) {
        console.log(
          chalk.yellow(`Telemetry data: ${JSON.stringify(eventPayload)}`)
        );
      }

      try {
        debug({ eventPayload });
        client.capture(eventPayload);
      } catch (err) {
        debug(err);
      }
    };
  };

  const shutdown = (client) => async () => {
    try {
      await client.shutdownAsync();
    } catch (err) {
      debug(err);
    }
  };

  try {
    const PostHog = require('posthog-node').PostHog;
    const client = new PostHog(POSTHOG_TOKEN, {
      flushInterval: 100
    });

    telemetry.capture = capture(client);
    telemetry.shutdown = shutdown(client);
  } catch (err) {
    debug(err);
  }

  return telemetry;
};

export { init, notice, isEnabled };
