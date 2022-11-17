/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const debug = require('debug')('util:aws:whoami');

const AWS = require('aws-sdk');

module.exports = async function whoami() {
  const sts = new AWS.STS();
  try {
    const response = sts.getCallerIdentity({}).promise();
    return response;
  } catch (stsErr) {
    return stsErr;
  }
};
