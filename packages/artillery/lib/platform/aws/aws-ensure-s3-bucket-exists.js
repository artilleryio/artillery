/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const debug = require('debug')('util:aws:ensureS3BucketExists');

const AWS = require('aws-sdk');

const getAWSAccountId = require('./aws-get-account-id');

const { S3_BUCKET_NAME_PREFIX } = require('./constants');

const setBucketLifecyclePolicy = async (
  bucketName,
  lifecycleConfigurationRules
) => {
  const s3 = new AWS.S3();
  const params = {
    Bucket: bucketName,
    LifecycleConfiguration: {
      Rules: lifecycleConfigurationRules
    }
  };
  try {
    await s3.putBucketLifecycleConfiguration(params).promise();
  } catch (err) {
    debug('Error setting lifecycle policy');
    debug(err);
  }
};

// Create an S3 bucket in the given region if it doesn't already exist.
// By default, the bucket will be created without specifying a specific region.
// Sometimes we need to use region-specific buckets, e.g. when
// creating Lambda functions from a zip file in S3 the region of the
// Lambda and the region of the S3 bucket must match.
module.exports = async function ensureS3BucketExists(
  region = 'global',
  lifecycleConfigurationRules = []
) {
  const accountId = await getAWSAccountId();
  let bucketName = `${S3_BUCKET_NAME_PREFIX}-${accountId}`;
  if (region !== 'global') {
    bucketName = `${S3_BUCKET_NAME_PREFIX}-${accountId}-${region}`;
  }
  const s3Opts = region === 'global' ? {} : { region };
  const s3 = new AWS.S3(s3Opts);

  try {
    await s3.listObjectsV2({ Bucket: bucketName, MaxKeys: 1 }).promise();
  } catch (s3Err) {
    if (s3Err.code === 'NoSuchBucket') {
      await s3.createBucket({ Bucket: bucketName }).promise();
    } else {
      throw s3Err;
    }
  }

  if (lifecycleConfigurationRules.length > 0) {
    await setBucketLifecyclePolicy(bucketName, lifecycleConfigurationRules);
  }

  debug(bucketName);
  return bucketName;
};
