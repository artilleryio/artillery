/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const debug = require('debug')('util:aws:getAccountId');
const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');

module.exports = async function getAccountId(stsOpts = {}) {
  if (!stsOpts.region) {
    stsOpts.region = global.artillery.awsRegion || 'us-east-1';
  }

  if (process.env.ARTILLERY_STS_OPTS) {
    stsOpts = Object.assign(
      stsOpts,
      JSON.parse(process.env.ARTILLERY_STS_OPTS)
    );
  }

  const sts = new STSClient(stsOpts);
  const result = await sts.send(new GetCallerIdentityCommand({}));
  const awsAccountId = result.Account;

  debug(awsAccountId);
  return awsAccountId;
};
