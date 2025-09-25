/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const debug = require('debug')('platform:aws-ecs');

const ensureS3BucketExists = require('../aws/aws-ensure-s3-bucket-exists');

const {
  IAMClient,
  GetRoleCommand,
  CreateRoleCommand,
  CreatePolicyCommand,
  AttachRolePolicyCommand
} = require('@aws-sdk/client-iam');

const { ensureParameterExists } = require('./legacy/aws-util');

const { S3_BUCKET_NAME_PREFIX } = require('../aws/constants');

const getAccountId = require('../aws/aws-get-account-id');

const sleep = require('../../util/sleep');
const { getBucketRegion } = require('../aws/aws-get-bucket-region');
const awsGetDefaultRegion = require('../aws/aws-get-default-region');

class PlatformECS {
  constructor(script, payload, opts, platformOpts) {
    this.opts = opts;
    this.platformOpts = platformOpts;

    this.arnPrefx = this.platformOpts.region.startsWith('cn-')
      ? 'arn:aws-cn'
      : 'arn:aws';

    this.testRunId = platformOpts.testRunId;
    if (!this.testRunId) {
      throw new Error('testRunId is required');
    }

    this.s3LifecycleConfigurationRules = [
      {
        Expiration: { Days: 2 },
        Filter: { Prefix: 'tests/' },
        ID: 'RemoveAdHocTestData',
        Status: 'Enabled'
      },
      {
        Expiration: { Days: 7 },
        Filter: { Prefix: 'test-runs/' },
        ID: 'RemoveTestRunMetadata',
        Status: 'Enabled'
      }
    ];
  }

  async init() {
    global.artillery.awsRegion =
      (await awsGetDefaultRegion()) || this.platformOpts.region;

    this.accountId = await getAccountId();

    await ensureSSMParametersExist(this.platformOpts.region);
    const bucketName = await ensureS3BucketExists(
      this.platformOpts.region,
      this.s3LifecycleConfigurationRules,
      false
    );

    global.artillery.s3BucketRegion = await getBucketRegion(bucketName);
    await createIAMResources(this.accountId, this.platformOpts.taskRoleName);
  }

  async createWorker() {}

  async prepareWorker() {}

  async runWorker() {}

  async stopWorker() {}

  async shutdown() {}
}

async function ensureSSMParametersExist(region) {
  await ensureParameterExists(
    '/artilleryio/NPM_TOKEN',
    'null',
    'SecureString',
    region
  );
  await ensureParameterExists(
    '/artilleryio/NPM_REGISTRY',
    'null',
    'String',
    region
  );
  await ensureParameterExists(
    '/artilleryio/NPM_SCOPE',
    'null',
    'String',
    region
  );
  await ensureParameterExists(
    '/artilleryio/ARTIFACTORY_AUTH',
    'null',
    'SecureString',
    region
  );
  await ensureParameterExists(
    '/artilleryio/ARTIFACTORY_EMAIL',
    'null',
    'String',
    region
  );
  await ensureParameterExists(
    '/artilleryio/NPMRC',
    'null',
    'SecureString',
    region
  );
  await ensureParameterExists(
    '/artilleryio/NPM_SCOPE_REGISTRY',
    'null',
    'String',
    region
  );
}

async function createIAMResources(accountId, taskRoleName) {
  const workerRoleArn = await createWorkerRole(accountId, taskRoleName);

  return {
    workerRoleArn
  };
}

async function createWorkerRole(accountId, taskRoleName) {
  const iam = new IAMClient({ region: global.artillery.awsRegion });

  try {
    const res = await iam.send(new GetRoleCommand({ RoleName: taskRoleName }));
    return res.Role.Arn;
  } catch (err) {
    debug(err);
  }

  const createRoleResp = await iam.send(
    new CreateRoleCommand({
      AssumeRolePolicyDocument: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              Service: ['ecs-tasks.amazonaws.com', 'ecs.amazonaws.com']
            },
            Action: 'sts:AssumeRole'
          }
        ]
      }),
      Path: '/',
      RoleName: taskRoleName
    })
  );

  const policyDocument = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: ['ssm:DescribeParameters'],
        Resource: ['*']
      },
      {
        Effect: 'Allow',
        Action: [
          'ssm:GetParameters',
          'ssm:GetParameter',
          'ssm:PutParameter',
          'ssm:DeleteParameter',
          'ssm:DescribeParameters',
          'ssm:GetParametersByPath'
        ],
        Resource: [
          `${this.arnPrefx}:ssm:*:${accountId}:parameter/artilleryio/*`
        ]
      },
      {
        Effect: 'Allow',
        Action: ['ecr:GetAuthorizationToken'],
        Resource: ['*']
      },
      {
        Effect: 'Allow',
        Action: ['logs:*'],
        Resource: [
          `${this.arnPrefx}:logs:*:${accountId}:log-group:artilleryio-log-group*:*`
        ]
      },
      {
        Effect: 'Allow',
        Action: ['sqs:*'],
        Resource: [`${this.arnPrefx}:sqs:*:${accountId}:artilleryio*`]
      },
      {
        Effect: 'Allow',
        Action: ['s3:*'],
        Resource: [
          `${this.arnPrefx}:s3:::${S3_BUCKET_NAME_PREFIX}-${accountId}`,
          `${this.arnPrefx}:s3:::${S3_BUCKET_NAME_PREFIX}-${accountId}/*`
        ]
      },
      {
        Effect: 'Allow',
        Action: ['xray:PutTraceSegments', 'xray:PutTelemetryRecords'],
        Resource: ['*']
      }
    ]
  };

  const createPolicyResp = await iam.send(
    new CreatePolicyCommand({
      PolicyName: 'artilleryio-ecs-worker-policy',
      Path: '/',
      PolicyDocument: JSON.stringify(policyDocument)
    })
  );

  await iam.send(
    new AttachRolePolicyCommand({
      PolicyArn: createPolicyResp.Policy.Arn,
      RoleName: taskRoleName
    })
  );

  debug('Waiting for IAM role to be ready');
  await sleep(30 * 1000);
  return createRoleResp.Role.Arn;
}

module.exports = PlatformECS;
