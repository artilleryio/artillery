/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const getCredentialsWithSSO = require('./aws-get-credentials');
const AWS = require('aws-sdk');
const debug = require('debug')('util:aws:setDefaultAWSCredentials');

const whoami = require('./aws-whoami');

module.exports = async function setDefaultAWSCredentials(SDK) {
  debug('Setting AWS credentials');
  if (
    AWS.config.credentials !== null &&
    typeof AWS.config.credentials === 'object'
  ) {
    debug('AWS credentials already set');
    debug(Object.keys(AWS.config.credentials));
    return;
  } else {
    debug(AWS.config.credentials);
  }

  const aws = SDK || AWS;

  if (process.env.DEBUG_AWS_SDK_CALLS) {
    aws.config.logger = artillery;
  }

  const [ssoAvailable, credentials] = await getCredentialsWithSSO();
  if (ssoAvailable) {
    if (credentials !== null) {
      await updateSSOCredentials(aws);

      setInterval(async () => {
        await updateSSOCredentials(aws);
      }, 60 * 10 * 1000).unref();
    } else {
      throw new Error(
        'The SSO session associated with this profile has expired or is otherwise invalid. To refresh this SSO session run aws sso login with the corresponding profile.'
      );
    }
  } else {
    debug(
      'AWS SSO not in use, will use credentials acquired automatically by AWS SDK'
    );
  }

  // This acts as a sanity check that we have *some* credentials:
  const me = await whoami();
  debug(me);
  debug(`AWS credentials expiration: ${AWS.config.credentials?.expiration}`);
  return true;
};

async function updateSSOCredentials(aws) {
  try {
    const [ssoAvailable, credentials] = await getCredentialsWithSSO();
    if (ssoAvailable && credentials) {
      debug('AWS credentials refreshed. Expiration:', credentials.expiration);
      aws.config.update({ credentials });
    } else {
      throw new Error('Unable to refresh AWS credentials from SSO');
    }
  } catch (err) {
    console.error(err);
  }
}
