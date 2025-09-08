/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');

module.exports = async function whoami() {
  const sts = new STSClient();
  try {
    const response = await sts.send(new GetCallerIdentityCommand({}));
    return response;
  } catch (stsErr) {
    return stsErr;
  }
};
