/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const debug = require('debug')('util:aws:getAccountId');

const AWS = require('aws-sdk');

module.exports = async function getAccountId() {
  let stsOpts = {};
  if (process.env.ARTILLERY_STS_OPTS) {
    stsOpts = Object.assign(
      stsOpts,
      JSON.parse(process.env.ARTILLERY_STS_OPTS)
    );
  }

  const sts = new AWS.STS(stsOpts);
  const awsAccountId = (await sts.getCallerIdentity({}).promise()).Account;

  debug(awsAccountId);
  return awsAccountId;
};
