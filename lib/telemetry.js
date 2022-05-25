/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const { version: artilleryVersion } = require('../package.json');
const { isCI, name: ciName } = require('ci-info');
const chalk = require('chalk');
const { readArtilleryConfig, updateArtilleryConfig } = require('./util');
const debug = require('debug')('telemetry');

const POSTHOG_TOKEN = '_uzX-_WJoVmE_tsLvu0OFD2tpd0HGz72D5sU1zM2hbs';

const noop = () => {};

const notice = () => {
  console.log(
    '  Telemetry is on. Learn more: https://artillery.io/docs/resources/core/telemetry.html'
  );
};

const firstRunMessage = () => {
  const { telemetryFirstRunMsg } = readArtilleryConfig();

  if (isCI || telemetryFirstRunMsg) {
    return;
  }

  notice();

  updateArtilleryConfig({ telemetryFirstRunMsg: true });
};

const init = () => {
  const telemetryDisabled = ['true', '1'].includes(
    process.env.ARTILLERY_DISABLE_TELEMETRY
  );
  const debugEnabled = ['true', '1'].includes(
    process.env.ARTILLERY_TELEMETRY_DEBUG
  );

  let telemetryDefaults = {};
  try {
    telemetryDefaults = JSON.parse(process.env.ARTILLERY_TELEMETRY_DEFAULTS)
  }catch (err){
    // fail silently
  }

  const telemetry = {
    capture: noop,
    shutdown: noop
  };

  if (telemetryDisabled) {
    return telemetry;
  }

  firstRunMessage();

  const capture = (client) => {
    return (event, data = {}) => {
      const eventPayload = {
        event,
        distinctId: data.distinctId || 'artillery-core',
        properties: {
          ...data,
          version: artilleryVersion,
          os: process.platform,
          isCi: isCI,
          $ip: null
        }
      };

      eventPayload.properties = Object.assign(eventPayload.properties, telemetryDefaults);

      if (isCI) {
        eventPayload.properties.ciName = ciName;
      }

      if (debugEnabled) {
        console.log(
          chalk.yellow(`Telemetry data: ${JSON.stringify(eventPayload)}`)
        );
      }

      try {
        debug({eventPayload});
        client.capture(eventPayload);
        client.flush();
      } catch (err) {
        debug(err);
      }
    };
  };

  const shutdown = (client) => () => {
    try {
      client.shutdown();
    } catch (err) {
      debug(err);
    }
  };

  try {
    const PostHog = require('posthog-node');
    const client = new PostHog(POSTHOG_TOKEN, {
      flushInterval: 100,
    });
    telemetry.capture = capture(client);
    telemetry.shutdown = shutdown(client);
  } catch (err) {
    debug(err);
  }

  return telemetry;
};

module.exports = { init, notice };
