/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const temp = require('temp');
const fs = require('fs-extra');
const spawn = require('cross-spawn');
const chalk = require('chalk');

const EventEmitter = require('events');
const debug = require('debug')('platform:aws-lambda');

const { randomUUID } = require('crypto');

const sleep = require('../../util/sleep');
const path = require('path');

const archiver = require('archiver');
const AWS = require('aws-sdk');

const https = require('https');

const { QueueConsumer } = require('../../queue-consumer');

const { createTest } = require('./create-test');

const setDefaultAWSCredentials = require('../aws/aws-set-default-credentials');

const telemetry = require('../../telemetry').init();
const crypto = require('node:crypto');

const prices = require('./prices');
const { STATES } = require('../local/artillery-worker-local');

const { SQS_QUEUES_NAME_PREFIX } = require('../aws/constants');
const ensureS3BucketExists = require('../aws/aws-ensure-s3-bucket-exists');
const getAccountId = require('../aws/aws-get-account-id');

const createSQSQueue = require('../aws/aws-create-sqs-queue');

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
    this.startTime = Date.now();

    this.count = 0;
    this.waitingReadyCount = 0;

    this.script = script;
    this.payload = payload;
    this.opts = opts;

    this.events = new EventEmitter();

    const platformConfig = platformOpts.platformConfig;

    this.architecture = platformConfig.architecture || 'arm64';
    this.region = platformConfig.region || 'us-east-1';

    this.securityGroupIds =
      platformConfig['security-group-ids']?.split(',') || [];
    this.subnetIds = platformConfig['subnet-ids']?.split(',') || [];

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
    artillery.log(
      'NOTE: AWS Lambda support is experimental. Not all Artillery features work yet.\nFor details please see https://docs.art/aws-lambda'
    );
    artillery.log();
    artillery.log('λ Creating AWS Lambda function...');

    await setDefaultAWSCredentials(AWS);
    this.accountId = await getAccountId();
    const bucketName = await ensureS3BucketExists(
      this.region,
      this.s3LifecycleConfigurationRules
    );
    this.bucketName = bucketName;

    const metadata = {
      region: this.region,
      platformConfig: {
        memory: this.memorySize,
        cpu: memoryToVCPU(this.memorySize)
      }
    };
    global.artillery.globalEvents.emit('metadata', metadata);

    const bom = await createTest(this.opts.absoluteScriptPath, this.opts.absoluteConfigPath, this.testRunId, this.bucketName);

    //TODO: account for dotenv
    // if (this.platformOpts.cliArgs.dotenv) {
    //   fs.copyFileSync(
    //     path.resolve(process.cwd(), this.platformOpts.cliArgs.dotenv),
    //     path.join(dirname, path.basename(this.platformOpts.cliArgs.dotenv))
    //   );
    // }

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
      this.artilleryArgs.push(p.noPrefix);
    }

    // This needs to be the last argument for now:
    const p = bom.files.filter(
      (x) => x.orig === this.opts.absoluteScriptPath
    )[0];
    this.artilleryArgs.push(p.noPrefix);

    artillery.log('Preparing AWS environment...');

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

    this.functionName = `artilleryio-${this.testRunId}`;
    await this.createLambda({
      bucketName: this.bucketName,
      functionName: this.functionName,
      zipPath: this.lambdaZipPath
    });
    //TODO: consolidate these logs into something consistent with fargate
    artillery.log(` - Lambda function: ${this.functionName}`);
    artillery.log(` - Region: ${this.region}`);
    artillery.log(` - AWS account: ${this.accountId}`);

    debug({ bucketName, sqsQueueUrl });

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
            console.log(`artillery.log: ${workerId}`)
            console.log(body.log);
          } else if (body.event === 'done') {
            console.log(`WE ARE DONE`)
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
            this.events.emit(body.event, workerId, {
              id: workerId,
              error: new Error(
                `A Lambda function has exited with an error. Reason: ${body.reason}`
              ),
              level: 'error',
              aggregatable: false,
              logs: body.logs
            });
          } else if (body.event == 'workerReady') {
            this.events.emit(body.event, workerId);
            this.waitingReadyCount++;

            // TODO: Do this only for batches of workers with "wait" option set
            if (this.waitingReadyCount === this.count) {
              // TODO: Retry
              try {
                const s3 = new AWS.S3();
                await s3
                  .putObject({
                    Body: Buffer.from(''),
                    Bucket: this.bucketName,
                    Key: `/${this.testRunId}/green`
                  })
                  .promise();
              } catch (err) {
                console.log(`FAILED TO PUT GREEN`)
                console.error(err);
              }
  
              console.log(`SUCCESSFULLY PUT GREEN`)
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

  async createWorker() {
    const workerId = randomUUID();

    return { workerId };
  }

  async prepareWorker(workerId) {}

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
    let waited = 0;
    let ok = false;
    while (waited < 120 * 1000) {
      try {
        var state = (
          await lambda
            .getFunctionConfiguration({ FunctionName: this.functionName })
            .promise()
        ).State;
        if (state === 'Active') {
          console.log('Lambda function ready:', this.functionName);
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
      console.log(
        'Time out waiting for lamda function to be ready:',
        this.functionName
      );
      throw new Error(
        'Timeout waiting for lambda function to be ready for invocation'
      );
    }

    artillery.log('Running your test in Lambda function...');
    await lambda
      .invoke({
        FunctionName: this.functionName,
        Payload: payload,
        InvocationType: 'Event'
      })
      .promise();
    
      console.log(`Lambda startup time: ${Date.now() - this.startTime}ms`)

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

      if (typeof process.env.RETAIN_LAMBDA === 'undefined') {
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

  async createZip(src, out) {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const stream = fs.createWriteStream(out);

    return new Promise((resolve, reject) => {
      archive
        .directory(src, false)
        .on('error', (err) => reject(err))
        .pipe(stream);

      stream.on('close', () => resolve());
      archive.finalize();
    });
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

  async createLambda(opts) {
    const { functionName } = opts;

    const lambda = new AWS.Lambda({
      apiVersion: '2015-03-31',
      region: this.region
    });

    const lambdaConfig = {
      PackageType: 'Image',
      Code: {
        ImageUri: '377705245354.dkr.ecr.us-east-1.amazonaws.com/artillery-bernardo-test:latest'
      },
      FunctionName: functionName,
      Description: 'Artillery.io test',
      MemorySize: this.memorySize,
      PackageType: 'Image',
      Timeout: 900,
      Role: this.lambdaRoleArn,
      //TODO: review architecture needed. Right now it's hardcoded to arm64. How will this affect users having to push their own docker image?
      Architectures: ['arm64'],
      Environment: {
        Variables: {
          S3_BUCKET_PATH: this.bucketName,
          NPM_CONFIG_CACHE: '/tmp/.npm', //TODO: move this to Dockerfile
          AWS_LAMBDA_LOG_FORMAT: 'JSON' //TODO: review this. we need to find a ways for logs to look better in Cloudwatch
        }
      }
    };

    if (this.securityGroupIds.length > 0 && this.subnetIds.length > 0) {
      lambdaConfig.VpcConfig = {
        SecurityGroupIds: this.securityGroupIds,
        SubnetIds: this.subnetIds
      };
    }

    await lambda.createFunction(lambdaConfig).promise();
  }
}

module.exports = PlatformLambda;
