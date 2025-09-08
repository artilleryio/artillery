'use strict';

const debug = require('debug')('artillery:util');

const chalk = require('chalk');

const _ = require('lodash');

const A = require('async');

const createS3Client = require('./create-s3-client');

const supportedRegions = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'us-gov-east-1',
  'us-gov-west-1',
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
  'il-central-1',
  'sa-east-1',
  'cn-north-1',
  'cn-northwest-1'
];

const getAccountId = require('../../aws/aws-get-account-id');

const { S3_BUCKET_NAME_PREFIX } = require('./constants');
const { paginateListObjectsV2 } = require('@aws-sdk/client-s3');

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

async function listAllObjectsWithPrefix(bucketName, prefix) {
  const s3Client = createS3Client();
  const allObjects = [];

  const paginator = paginateListObjectsV2(
    { client: s3Client },
    {
      Bucket: bucketName,
      Prefix: prefix,
      MaxKeys: 1000
    }
  );

  try {
    for await (const page of paginator) {
      if (page.Contents) {
        allObjects.push(...page.Contents);
      }
    }
  } catch (error) {
    throw error;
  }

  return allObjects;
}

module.exports = {
  supportedRegions,
  getAccountId,
  atob,
  btoa,
  formatError,
  listAllObjectsWithPrefix,
  getBucketName
};
