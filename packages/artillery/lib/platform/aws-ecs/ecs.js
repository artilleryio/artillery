/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const debug = require('debug')('platform:aws-ecs');

const ensureS3BucketExists = require('../aws/aws-ensure-s3-bucket-exists');

const setDefaultAWSCredentials = require('../aws/aws-set-default-credentials');
const AWS = require('aws-sdk');

const {
  S3_BUCKET_NAME_PREFIX,
  ECS_WORKER_ROLE_NAME
} = require('../aws/constants');

const getAccountId = require('../aws/aws-get-account-id');

class PlatformECS {
  constructor(script, payload, opts, platformOpts) {
    this.opts = opts;
    this.testRunId = platformOpts.testRunId;
    if (!this.testRunId) {
      throw new Error('testRunId is required');
    }
  }

  async init() {
    await setDefaultAWSCredentials(AWS);

    this.accountId = await getAccountId();

    await ensureS3BucketExists();
    await createIAMResources(this.accountId);
  }

  async createWorker() {}

  async prepareWorker() {}

  async runWorker() {}

  async stopWorker() {}

  async shutdown() {}
}

async function createIAMResources(accountId) {
  const workerRoleArn = await createWorkerRole(accountId);

  return {
    workerRoleArn
  };
}

async function createWorkerRole(accountId) {
  const iam = new AWS.IAM();

  try {
    const res = await iam.getRole({ RoleName: ECS_WORKER_ROLE_NAME }).promise();
    return res.Role.Arn;
  } catch (err) {
    debug(err);
  }

  const createRoleResp = await iam
    .createRole({
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
      RoleName: ECS_WORKER_ROLE_NAME
    })
    .promise();

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
        Resource: [`arn:aws:ssm:*:${accountId}:parameter/artilleryio/*`]
      },
      {
        Effect: 'Allow',
        Action: [
          'ecr:BatchCheckLayerAvailability',
          'ecr:GetDownloadUrlForLayer',
          'ecr:BatchGetImage',
          'ecr:ListImages'
        ],
        Resource: [
          // TODO: All supported regions
          'arn:aws:ecr:us-east-1:301676560329:repository/artillery-pro/aws-ecs-node',
          'arn:aws:ecr:us-west-1:301676560329:repository/artillery-pro/aws-ecs-node',
          'arn:aws:ecr:eu-west-1:301676560329:repository/artillery-pro/aws-ecs-node',
          'arn:aws:ecr:eu-central-1:301676560329:repository/artillery-pro/aws-ecs-node',
          'arn:aws:ecr:ap-south-1:301676560329:repository/artillery-pro/aws-ecs-node',
          'arn:aws:ecr:ap-northeast-1:301676560329:repository/artillery-pro/aws-ecs-node'
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
          `arn:aws:logs:*:${accountId}:log-group:artilleryio-log-group*:*`
        ]
      },
      {
        Effect: 'Allow',
        Action: ['sqs:*'],
        Resource: [`arn:aws:sqs:*:${accountId}:artilleryio*`]
      },
      {
        Effect: 'Allow',
        Action: ['s3:*'],
        Resource: [
          `arn:aws:s3:::${S3_BUCKET_NAME_PREFIX}-${accountId}`,
          `arn:aws:s3:::${S3_BUCKET_NAME_PREFIX}-${accountId}/*`
        ]
      }
    ]
  };

  const createPolicyResp = await iam
    .createPolicy({
      PolicyName: 'artilleryio-ecs-worker-policy',
      Path: '/',
      PolicyDocument: JSON.stringify(policyDocument)
    })
    .promise();

  await iam
    .attachRolePolicy({
      PolicyArn: createPolicyResp.Policy.Arn,
      RoleName: ECS_WORKER_ROLE_NAME
    })
    .promise();

  return createRoleResp.Role.Arn;
}

module.exports = PlatformECS;
