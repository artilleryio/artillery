/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const { version: artilleryVersion } = require('../package.json');
const { isCI, name: ciName } = require('ci-info');
const debug = require('debug')('telemetry');

const POSTHOG_TOKEN = '_uzX-_WJoVmE_tsLvu0OFD2tpd0HGz72D5sU1zM2hbs';

const notice = () => {
  console.log(
    'Anonymized telemetry is on. Learn more: https://artillery.io/docs/resources/core/telemetry.html'
  );
};

const isEnabled = () => {
  return typeof process.env.ARTILLERY_DISABLE_TELEMETRY === 'undefined';
};

async function capture(eventName, data) {
  if (!isEnabled()) {
    return;
  }

  const debugEnabled =
    typeof process.env.ARTILLERY_TELEMETRY_DEBUG !== 'undefined';

  const url = 'https://us.i.posthog.com/i/v0/e/';
  const headers = {
    'Content-Type': 'application/json'
  };

  let telemetryDefaults = {};
  try {
    telemetryDefaults = JSON.parse(process.env.ARTILLERY_TELEMETRY_DEFAULTS);
  } catch (_err) {
    /* empty */
  }

  const properties = Object.assign(
    {
      ...data,
      $process_person_profile: false,
      version: artilleryVersion,
      os: process.platform,
      isCi: isCI,
      ciName: isCI ? ciName : undefined,
      $ip: 'not-collected'
    },
    telemetryDefaults
  );

  const payload = {
    api_key: POSTHOG_TOKEN,
    event: eventName,
    distinct_id: data.distinctId || 'artillery-core',
    properties
  };

  if (debugEnabled) {
    console.log(`Telemetry data: ${JSON.stringify(payload.properties)}`);
  }

  try {
    await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });
  } catch (err) {
    debug(err);
  }
}

module.exports = { notice, capture, isEnabled };
