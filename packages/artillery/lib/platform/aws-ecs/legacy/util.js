'use strict';

const debug = require('debug')('artillery:util');

const AWS = require('aws-sdk');

const chalk = require('chalk');

const _ = require('lodash');

const A = require('async');

const createS3Client = require('./create-s3-client');

const supportedRegions = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'ca-central-1',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'eu-central-1',
  'eu-north-1',
  'ap-south-1',
  'ap-east-1',
  'ap-northeast-2',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'me-south-1',
  'sa-east-1'
];

const getAccountId = require('../../aws/aws-get-account-id');

const { S3_BUCKET_NAME_PREFIX } = require('./constants');

function atob(data) {
  return Buffer.from(data, 'base64').toString('ascii');
}
function btoa(data) {
  return Buffer.from(data).toString('base64');
}

async function getBucketName() {
  if (process.env.ARTILLERY_S3_BUCKET) {
    return process.env.ARTILLERY_S3_BUCKET;
  }

  const accountId = await getAccountId();
  const bucketName = `${S3_BUCKET_NAME_PREFIX}-${accountId}`;
  // const bucketArn = `arn:aws:s3:::${bucketName}`;
  return bucketName;
}

function formatError(err) {
  return (
    `${chalk.red('Error')}: ${err.message}` + (err.code ? ` (${err.code})` : '')
  );
}

// lists all objects - responsibility for checking the count is on the caller
// TODO: prefix should be a parameter
function listAllObjectsWithPrefix(bucket, prefix, cb) {
  const s3 = createS3Client();

  const MAGIC_LIMIT = 100;

  let result = [];

  let params = {
    Bucket: bucket,
    MaxKeys: MAGIC_LIMIT,
    Prefix: prefix
  };

  A.doWhilst(
    function iteratee(next) {
      s3.listObjectsV2(params, (s3Err, s3Data) => {
        if (s3Err) {
          return next(s3Err);
        } else {
          debug(`listObjectsV2: IsTruncated: ${s3Data.IsTruncated}`);
          debug(
            `listObjectsV2: KeyCount: ${s3Data.KeyCount} keys in the response`
          );

          result = result.concat(s3Data.Contents);

          if (s3Data.IsTruncated) {
            params.ContinuationToken = s3Data.NextContinuationToken;
            return next(null, true);
          } else {
            return next(null, false);
          }
        }
      });
    },
    function test(shouldContinue) {
      return shouldContinue;
    },
    function finished(err) {
      if (err) {
        return cb(err);
      } else {
        debug(`listAllObjectsWithPrefix: returning ${result.length} results`);
        return cb(null, result);
      }
    }
  );
} // listAllObjectsWithPrefix

function credentialsProvided(cb) {
  const credsProvided = new AWS.Config().credentials !== null;
  if (cb) {
    return cb(credsProvided);
  } else {
    return credsProvided;
  }
}

module.exports = {
  supportedRegions,
  getAccountId,
  atob,
  btoa,
  formatError,
  listAllObjectsWithPrefix,
  credentialsProvided,
  getBucketName
};
