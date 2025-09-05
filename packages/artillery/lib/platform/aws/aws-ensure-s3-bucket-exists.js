/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const debug = require('debug')('util:aws:ensureS3BucketExists');

const {
  S3Client,
  PutBucketLifecycleConfigurationCommand,
  ListObjectsV2Command,
  CreateBucketCommand,
  GetBucketLocationCommand
} = require('@aws-sdk/client-s3');

const getAWSAccountId = require('./aws-get-account-id');
const createS3Client = require('../aws-ecs/legacy/create-s3-client');
const { S3_BUCKET_NAME_PREFIX } = require('./constants');
const { getBucketRegion } = require('./aws-get-bucket-region');

const setBucketLifecyclePolicy = async (
  bucketName,
  lifecycleConfigurationRules,
  region
) => {
  const s3 = createS3Client({ region });
  const params = {
    Bucket: bucketName,
    LifecycleConfiguration: {
      Rules: lifecycleConfigurationRules
    }
  };
  try {
    await s3.send(new PutBucketLifecycleConfigurationCommand(params));
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
  region,
  lifecycleConfigurationRules = [],
  withRegionSpecificName = false
) {
  const accountId = await getAWSAccountId();
  let bucketName = `${S3_BUCKET_NAME_PREFIX}-${accountId}`;
  if (withRegionSpecificName) {
    bucketName = `${S3_BUCKET_NAME_PREFIX}-${accountId}-${region}`;
  }

  const s3 = new S3Client({ region });

  let location;
  try {
    location = await getBucketRegion(bucketName);
  } catch (err) {
    if (err.name === 'NoSuchBucket') {
      await s3.send(new CreateBucketCommand({ Bucket: bucketName }));
    } else {
      throw err;
    }
  }

  if (lifecycleConfigurationRules.length > 0) {
    await setBucketLifecyclePolicy(
      bucketName,
      lifecycleConfigurationRules,
      location
    );
  }

  debug(bucketName);
  return bucketName;
};
