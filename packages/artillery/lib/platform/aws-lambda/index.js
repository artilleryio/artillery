/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EventEmitter = require('events');
const debug = require('debug')('platform:aws-lambda');

const { randomUUID } = require('crypto');

const sleep = require('../../util/sleep');
const path = require('path');
const AWS = require('aws-sdk');

const https = require('https');

const { QueueConsumer } = require('../../queue-consumer');

const setDefaultAWSCredentials = require('../aws/aws-set-default-credentials');

const telemetry = require('../../telemetry').init();
const crypto = require('node:crypto');

const prices = require('./prices');
const { STATES } = require('../local/artillery-worker-local');
const _ = require('lodash');

const { SQS_QUEUES_NAME_PREFIX } = require('../aws/constants');
const ensureS3BucketExists = require('../aws/aws-ensure-s3-bucket-exists');
const getAccountId = require('../aws/aws-get-account-id');

const createSQSQueue = require('../aws/aws-create-sqs-queue');
const { createAndUploadTestDependencies } = require('./dependencies');
const pkgVersion = require('../../../package.json').version;

// https://stackoverflow.com/a/66523153
function memoryToVCPU(memMB) {
  if (memMB < 832) {
    return 0.5;
  }

  if (memMB < 3009) {
    return 2;
  }

  if (memMB < 5308) {
    return 3;
  }

  if (memMB < 7077) {
    return 4;
  }

  if (memMB < 8846) {
    return 5;
  }

  return 6;
}

class PlatformLambda {
  constructor(script, payload, opts, platformOpts) {
    this.workers = {};

    this.count = 0;
    this.waitingReadyCount = 0;

    this.script = script;
    this.payload = payload;
    this.opts = opts;

    this.events = new EventEmitter();

    const platformConfig = platformOpts.platformConfig;

    this.currentVersion = process.env.LAMBDA_IMAGE_VERSION || pkgVersion;
    this.ecrImageUrl = process.env.WORKER_IMAGE_URL;
    this.architecture = platformConfig.architecture || 'arm64';
    this.region = platformConfig.region || 'us-east-1';

    this.securityGroupIds =
      platformConfig['security-group-ids']?.split(',') || [];
    this.subnetIds = platformConfig['subnet-ids']?.split(',') || [];

    this.useVPC = this.securityGroupIds.length > 0 && this.subnetIds.length > 0;

    this.memorySize = platformConfig['memory-size'] || 4096;

    this.testRunId = platformOpts.testRunId;
    this.lambdaRoleArn =
      platformConfig['lambda-role-arn'] || platformConfig['lambdaRoleArn'];

    this.platformOpts = platformOpts;
    this.s3LifecycleConfigurationRules = [
      {
        Expiration: { Days: 2 },
        Filter: { Prefix: '/lambda' },
        ID: 'RemoveAdHocTestData',
        Status: 'Enabled'
      },
      {
        Expiration: { Days: 7 },
        Filter: { Prefix: '/' },
        ID: 'RemoveTestRunMetadata',
        Status: 'Enabled'
      }
    ];

    this.artilleryArgs = [];
  }

  async init() {
    artillery.log('λ Preparing AWS Lambda function...');

    await setDefaultAWSCredentials(AWS);
    this.accountId = await getAccountId();

    const metadata = {
      region: this.region,
      platformConfig: {
        memory: this.memorySize,
        cpu: memoryToVCPU(this.memorySize)
      }
    };
    global.artillery.globalEvents.emit('metadata', metadata);

    //make sure the bucket exists to send the zip file or the dependencies to
    const bucketName = await ensureS3BucketExists(
      this.region,
      this.s3LifecycleConfigurationRules
    );
    this.bucketName = bucketName;

    const { bom, s3Path } = await createAndUploadTestDependencies(
      this.bucketName,
      this.testRunId,
      this.opts.absoluteScriptPath,
      this.opts.absoluteConfigPath,
      this.platformOpts.cliArgs
    );

    this.artilleryArgs.push('run');

    if (this.platformOpts.cliArgs.environment) {
      this.artilleryArgs.push('-e');
      this.artilleryArgs.push(this.platformOpts.cliArgs.environment);
    }
    if (this.platformOpts.cliArgs.solo) {
      this.artilleryArgs.push('--solo');
    }

    if (this.platformOpts.cliArgs.target) {
      this.artilleryArgs.push('--target');
      this.artilleryArgs.push(this.platformOpts.cliArgs.target);
    }

    if (this.platformOpts.cliArgs.variables) {
      this.artilleryArgs.push('-v');
      this.artilleryArgs.push(this.platformOpts.cliArgs.variables);
    }

    if (this.platformOpts.cliArgs.overrides) {
      this.artilleryArgs.push('--overrides');
      this.artilleryArgs.push(this.platformOpts.cliArgs.overrides);
    }

    if (this.platformOpts.cliArgs.dotenv) {
      this.artilleryArgs.push('--dotenv');
      this.artilleryArgs.push(path.basename(this.platformOpts.cliArgs.dotenv));
    }

    if (this.platformOpts.cliArgs['scenario-name']) {
      this.artilleryArgs.push('--scenario-name');
      this.artilleryArgs.push(this.platformOpts.cliArgs['scenario-name']);
    }

    if (this.platformOpts.cliArgs.config) {
      this.artilleryArgs.push('--config');
      const p = bom.files.filter(
        (x) => x.orig === this.opts.absoluteConfigPath
      )[0];
      this.artilleryArgs.push(p.noPrefixPosix);
    }

    // This needs to be the last argument for now:
    const p = bom.files.filter(
      (x) => x.orig === this.opts.absoluteScriptPath
    )[0];
    this.artilleryArgs.push(p.noPrefixPosix);
    // 36 is length of a UUUI v4 string
    const queueName = `${SQS_QUEUES_NAME_PREFIX}_${this.testRunId.slice(
      0,
      36
    )}.fifo`;

    const sqsQueueUrl = await createSQSQueue(this.region, queueName);
    this.sqsQueueUrl = sqsQueueUrl;

    if (typeof this.lambdaRoleArn === 'undefined') {
      const lambdaRoleArn = await this.createLambdaRole();
      this.lambdaRoleArn = lambdaRoleArn;
    } else {
      artillery.log(` - Lambda role ARN: ${this.lambdaRoleArn}`);
    }

    this.functionName = this.createFunctionNameWithHash();

    await this.createOrUpdateLambdaFunctionIfNeeded();

    artillery.log(` - Lambda function: ${this.functionName}`);
    artillery.log(` - Region: ${this.region}`);
    artillery.log(` - AWS account: ${this.accountId}`);

    debug({ bucketName, s3Path, sqsQueueUrl });

    const self = this;

    const consumer = new QueueConsumer();
    consumer.create(
      {
        poolSize: Math.min(self.platformOpts.count, 100)
      },
      {
        queueUrl: process.env.SQS_QUEUE_URL || this.sqsQueueUrl,
        region: this.region,
        waitTimeSeconds: 10,
        messageAttributeNames: ['testId', 'workerId'],
        visibilityTimeout: 60,
        batchSize: 10,
        sqs: new AWS.SQS({
          httpOptions: {
            agent: new https.Agent({
              keepAlive: true
            })
          },
          region: this.region
        }),
        handleMessage: async (message) => {
          let body = null;
          try {
            body = JSON.parse(message.Body);
          } catch (err) {
            console.error(err);
            console.log(message.Body);
          }

          //
          // Ignore any messages that are invalid or not tagged properly.
          //

          if (process.env.LOG_SQS_MESSAGES) {
            console.log(message);
          }

          if (!body) {
            throw new Error('SQS message with empty body');
          }

          const attrs = message.MessageAttributes;
          if (!attrs || !attrs.testId || !attrs.workerId) {
            throw new Error('SQS message with no testId or workerId');
          }

          if (self.testRunId !== attrs.testId.StringValue) {
            throw new Error('SQS message for an unknown testId');
          }

          const workerId = attrs.workerId.StringValue;

          if (body.event === 'workerStats') {
            this.events.emit('stats', workerId, body); // event consumer accesses body.stats
          } else if (body.event === 'artillery.log') {
            console.log(body.log);
          } else if (body.event === 'done') {
            // 'done' handler in Launcher exects the message argument to have an "id" and "report" fields
            body.id = workerId;
            body.report = body.stats; // Launcher expects "report", SQS reporter sends "stats"
            this.events.emit('done', workerId, body);
          } else if (
            body.event === 'phaseStarted' ||
            body.event === 'phaseCompleted'
          ) {
            body.id = workerId;
            this.events.emit(body.event, workerId, { phase: body.phase });
          } else if (body.event === 'workerError') {
            global.artillery.suggestedExitCode = body.exitCode || 1;

            if (body.exitCode != 21) {
              this.events.emit(body.event, workerId, {
                id: workerId,
                error: new Error(
                  `A Lambda function has exited with an error. Reason: ${body.reason}`
                ),
                level: 'error',
                aggregatable: false,
                logs: body.logs
              });
            }
          } else if (body.event == 'workerReady') {
            this.events.emit(body.event, workerId);
            this.waitingReadyCount++;

            // TODO: Do this only for batches of workers with "wait" option set
            if (this.waitingReadyCount === this.count) {
              // TODO: Retry
              const s3 = new AWS.S3();
              await s3
                .putObject({
                  Body: Buffer.from(''),
                  Bucket: this.bucketName,
                  Key: `/${this.testRunId}/green`
                })
                .promise();
            }
          } else {
            debug(body);
          }
        }
      }
    );

    let queueEmpty = 0;

    consumer.on('error', (err) => {
      artillery.log(err);
    });
    consumer.on('empty', (_err) => {
      debug('queueEmpty:', queueEmpty);
      queueEmpty++;
    });

    consumer.start();

    this.sqsConsumer = consumer;

    // TODO: Start the timer when the first worker is created
    const startedAt = Date.now();
    global.artillery.ext({
      ext: 'beforeExit',
      method: async (event) => {
        try {
          await telemetry.capture({
            event: 'ping',
            awsAccountId: crypto
              .createHash('sha1')
              .update(self.accountId)
              .digest('base64')
          });

          process.nextTick(() => {
            telemetry.shutdown();
          });
        } catch (_err) {}

        function round(number, decimals) {
          const m = Math.pow(10, decimals);
          return Math.round(number * m) / m;
        }

        if (event.flags && event.flags.platform === 'aws:lambda') {
          let price = 0;
          if (!prices[self.region]) {
            price = prices.base[self.architecture];
          } else {
            price = prices[self.region][self.architecture];
          }

          const duration = Math.ceil((Date.now() - startedAt) / 1000);
          const total =
            ((price * self.memorySize) / 1024) *
            self.platformOpts.count *
            duration;
          const cost = round(total / 10e10, 4);
          console.log(`\nEstimated AWS Lambda cost for this test: $${cost}\n`);
        }
      }
    });
  }

  getDesiredWorkerCount() {
    return this.platformOpts.count;
  }

  async startJob() {
    await this.init();

    for (let i = 0; i < this.platformOpts.count; i++) {
      const { workerId } = await this.createWorker();
      this.workers[workerId] = { id: workerId };
      await this.runWorker(workerId);
    }
  }

  async createWorker() {
    const workerId = randomUUID();

    return { workerId };
  }

  async runWorker(workerId) {
    const lambda = new AWS.Lambda({
      apiVersion: '2015-03-31',
      region: this.region
    });
    const event = {
      SQS_QUEUE_URL: this.sqsQueueUrl,
      SQS_REGION: this.region,
      WORKER_ID: workerId,
      ARTILLERY_ARGS: this.artilleryArgs,
      TEST_RUN_ID: this.testRunId,
      BUCKET: this.bucketName,
      WAIT_FOR_GREEN: true
    };

    debug('Lambda event payload:');
    debug({ event });

    const payload = JSON.stringify(event);

    // Wait for the function to be invocable:
    const timeout = this.useVPC ? 240e3 : 120e3;
    let waited = 0;
    let ok = false;
    while (waited < timeout) {
      try {
        var state = (
          await lambda
            .getFunctionConfiguration({ FunctionName: this.functionName })
            .promise()
        ).State;
        if (state === 'Active') {
          debug('Lambda function ready:', this.functionName);
          ok = true;
          break;
        } else {
          await sleep(10 * 1000);
          waited += 10 * 1000;
        }
      } catch (err) {
        debug('Error getting lambda state:', err);
        await sleep(10 * 1000);
        waited += 10 * 1000;
      }
    }

    if (!ok) {
      debug(
        'Time out waiting for lamda function to be ready:',
        this.functionName
      );
      throw new Error(
        'Timeout waiting for lambda function to be ready for invocation'
      );
    }

    await lambda
      .invoke({
        FunctionName: this.functionName,
        Payload: payload,
        InvocationType: 'Event'
      })
      .promise();

    this.count++;
  }

  async stopWorker(workerId) {
    // TODO: Send message to that worker and have it exit early
  }

  async shutdown() {
    if (this.sqsConsumer) {
      this.sqsConsumer.stop();
    }

    const s3 = new AWS.S3({ region: this.region });
    const sqs = new AWS.SQS({ region: this.region });
    const lambda = new AWS.Lambda({
      apiVersion: '2015-03-31',
      region: this.region
    });

    try {
      await sqs
        .deleteQueue({
          QueueUrl: this.sqsQueueUrl
        })
        .promise();

      if (process.env.RETAIN_LAMBDA === 'false') {
        await lambda
          .deleteFunction({
            FunctionName: this.functionName
          })
          .promise();
      }
    } catch (err) {
      console.error(err);
    }
  }

  async createLambdaRole() {
    const ROLE_NAME = 'artilleryio-default-lambda-role-20230116';
    const POLICY_NAME = 'artilleryio-lambda-policy-20230116';

    const iam = new AWS.IAM();

    try {
      const res = await iam.getRole({ RoleName: ROLE_NAME }).promise();
      return res.Role.Arn;
    } catch (err) {
      debug(err);
    }

    const res = await iam
      .createRole({
        AssumeRolePolicyDocument: `{
        "Version": "2012-10-17",
        "Statement": [
          {
            "Effect": "Allow",
            "Principal": {
              "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
          }
        ]
      }`,
        Path: '/',
        RoleName: ROLE_NAME
      })
      .promise();

    const lambdaRoleArn = res.Role.Arn;

    await iam
      .attachRolePolicy({
        PolicyArn:
          'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
        RoleName: ROLE_NAME
      })
      .promise();

    await iam
      .attachRolePolicy({
        PolicyArn:
          'arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole',
        RoleName: ROLE_NAME
      })
      .promise();

    const iamRes = await iam
      .createPolicy({
        PolicyDocument: `{
        "Version": "2012-10-17",
        "Statement": [
          {
            "Effect": "Allow",
            "Action": ["sqs:*"],
            "Resource": "arn:aws:sqs:*:${this.accountId}:artilleryio*"
          },
          {
            "Effect": "Allow",
            "Action": ["s3:HeadObject", "s3:PutObject", "s3:ListBucket", "s3:GetObject", "s3:GetObjectAttributes"],
            "Resource": [ "arn:aws:s3:::artilleryio-test-data*",  "arn:aws:s3:::artilleryio-test-data*/*" ]
          }
        ]
      }
      `,
        PolicyName: POLICY_NAME,
        Path: '/'
      })
      .promise();

    await iam
      .attachRolePolicy({
        PolicyArn: iamRes.Policy.Arn,
        RoleName: ROLE_NAME
      })
      .promise();

    // See https://stackoverflow.com/a/37438525 for why we need this
    await sleep(10 * 1000);

    return lambdaRoleArn;
  }

  async createOrUpdateLambdaFunctionIfNeeded() {
    const existingLambdaConfig = await this.getLambdaFunctionConfiguration();

    if (existingLambdaConfig) {
      debug(
        'Lambda function with this configuration already exists. Using existing function.'
      );
      return;
    }

    try {
      await this.createLambda({
        bucketName: this.bucketName,
        functionName: this.functionName
      });
      return;
    } catch (err) {
      if (err.code === 'ResourceConflictException') {
        debug(
          'Lambda function with this configuration already exists. Using existing function.'
        );
        return;
      }

      throw new Error(`Failed to create Lambda Function: \n${err}`);
    }
  }

  async getLambdaFunctionConfiguration() {
    const lambda = new AWS.Lambda({
      apiVersion: '2015-03-31',
      region: this.region
    });

    try {
      const res = await lambda
        .getFunctionConfiguration({
          FunctionName: this.functionName
        })
        .promise();

      return res;
    } catch (err) {
      if (err.code === 'ResourceNotFoundException') {
        return null;
      }

      throw new Error(`Failed to get Lambda Function: \n${err}`);
    }
  }

  createFunctionNameWithHash(lambdaConfig) {
    const changeableConfig = {
      MemorySize: this.memorySize,
      VpcConfig: {
        SecurityGroupIds: this.securityGroupIds,
        SubnetIds: this.subnetIds
      }
    };

    const configHash = crypto
      .createHash('md5')
      .update(JSON.stringify(changeableConfig))
      .digest('hex');

    let name = `artilleryio-v${this.currentVersion.replace(/\./g, '-')}-${
      this.architecture
    }-${configHash}`;

    if (name.length > 64) {
      name = name.slice(0, 64);
    }

    return name;
  }

  async createLambda(opts) {
    const { bucketName, functionName } = opts;

    const lambda = new AWS.Lambda({
      apiVersion: '2015-03-31',
      region: this.region
    });

    const lambdaConfig = {
      PackageType: 'Image',
      Code: {
        ImageUri:
          this.ecrImageUrl ||
          `248481025674.dkr.ecr.${this.region}.amazonaws.com/artillery-worker:${this.currentVersion}-${this.architecture}`
      },
      ImageConfig: {
        Command: ['a9-handler-index.handler'],
        EntryPoint: ['/usr/bin/npx', 'aws-lambda-ric']
      },
      FunctionName: functionName,
      Description: 'Artillery.io test',
      MemorySize: this.memorySize,
      Timeout: 900,
      Role: this.lambdaRoleArn,
      //TODO: architecture influences the entrypoint. We should review which architecture to use in the end (may impact Playwright viability)
      Architectures: [this.architecture],
      Environment: {
        Variables: {
          S3_BUCKET_PATH: this.bucketName,
          NPM_CONFIG_CACHE: '/tmp/.npm', //TODO: move this to Dockerfile
          AWS_LAMBDA_LOG_FORMAT: 'JSON', //TODO: review this. we need to find a ways for logs to look better in Cloudwatch
          ARTILLERY_WORKER_PLATFORM: 'aws:lambda'
        }
      }
    };

    if (this.useVPC) {
      lambdaConfig.VpcConfig = {
        SecurityGroupIds: this.securityGroupIds,
        SubnetIds: this.subnetIds
      };
    }

    await lambda.createFunction(lambdaConfig).promise();
  }
}

module.exports = PlatformLambda;
