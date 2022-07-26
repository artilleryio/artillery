/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const temp = require('temp');
const fs = require('fs');
const { spawnSync } = require('child_process');
const chalk = require('chalk');

const EventEmitter = require('events');
const debug = require('debug')('platform:aws-lambda')

const { randomUUID } = require('crypto');

const sleep = require('../../util/sleep');
const path = require('path');

const archiver = require('archiver');
const AWS = require('aws-sdk');

const https = require('https');

const { Consumer } = require('sqs-consumer');

const setDefaultAWSCredentials = require('../aws/aws-set-default-credentials');

class PlatformLambda {
  constructor(script, payload, opts, platformOpts) {
    this.workers = {};
    this.script = script;
    this.payload = payload;
    this.opts = opts;

    this.events = new EventEmitter();

    this.region = platformOpts.platformConfig.region || 'us-east-1';
    this.testRunId = platformOpts.testRunId || randomUUID();
    this.lambdaRoleArn = platformOpts.lambdaRoleArn;

    this.platformOpts = platformOpts;

    this.artilleryArgs = [];
  }

  async init() {
    artillery.log(chalk.gray('NOTE: AWS Lambda support is experimental. Not all Artillery features work yet.'));
    artillery.log(chalk.gray('For details please see https://docs.art/aws-lambda'));
    artillery.log();
    artillery.log('λ Creating AWS Lambda function...');

    await setDefaultAWSCredentials(AWS);
    this.accountId = await this.getAccountId();

    const dirname = temp.mkdirSync(); // TODO: May want a way to override this by the user
    const zipfile = temp.path({ suffix: '.zip' });

    debug({dirname, zipfile});

    fs.copyFileSync(path.resolve(__dirname, 'lambda-handler', 'index.js'), path.join(dirname, 'index.js'));
    fs.copyFileSync(path.resolve(__dirname, 'lambda-handler', 'package.json'), path.join(dirname, 'package.json'));
    fs.copyFileSync(this.opts.absoluteScriptPath, path.join(dirname, path.basename(this.opts.absoluteScriptPath)));

    if (this.platformOpts.cliArgs.dotenv) {
      fs.copyFileSync(path.resolve(process.cwd(), this.platformOpts.cliArgs.dotenv), path.join(dirname, path.basename(this.platformOpts.cliArgs.dotenv)));
    }

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

    // This needs to be the last argument for now:
    this.artilleryArgs.push(path.basename(this.opts.absoluteScriptPath));


    artillery.log('    - Installing dependencies')
    const { stdout, stderr, status, error } = spawnSync('npm', ['install'], {cwd: dirname});
    if (error) {
      artillery.log(stdout.toString(), stderr.toString(), status, error);
    } else {
      // artillery.log('        npm log is in:', temp.path({suffix: '.log'}));
    }
    artillery.log('    - Creating zip package');
    await this.createZip(dirname, zipfile);

    artillery.log('Preparing AWS environment...')
    const bucketName = await this.ensureS3BucketExists();
    this.bucketName = bucketName;

    const s3path = await this.uploadLambdaZip(bucketName, zipfile);
    debug({s3path});
    this.lambdaZipPath = s3path;
    const sqsQueueUrl = await this.createSQSQueue(this.region);
    this.sqsQueueUrl = sqsQueueUrl;

    // TODO: Print Lambda role ARN if custom
    if(typeof this.lambdaRoleArn === 'undefined') {
      const lambdaRoleArn = await this.createLambdaRole();
      this.lambdaRoleArn = lambdaRoleArn;
    }

    this.functionName = `artilleryio-${this.testRunId}`;
    await this.createLambda({
      bucketName: this.bucketName,
      functionName: this.functionName,
      zipPath: this.lambdaZipPath,
    });
    artillery.log(`    - Lambda function: ${this.functionName}`);
    artillery.log(`    - Region: ${this.region}`);
    artillery.log(`    - AWS account: ${this.accountId}`);

    debug({ bucketName, s3path, sqsQueueUrl });

    const self = this;

    const consumer = Consumer.create({
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

        if(process.env.LOG_SQS_MESSAGES) {
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
        } else if (body.event === 'phaseStarted' || body.event === 'phaseCompleted') {
          body.id = workerId;
          this.events.emit(body.event, workerId, { phase: body.phase });
        } else if (body.event === 'workerError') {
          this.events.emit(body.event, workerId, {
            id: workerId,
            error: new Error(`A Lambda function has exited with an error. Reason: ${body.reason}`),
            level: 'error',
            aggregatable: false,
          });
        } else {
          debug(body);
        }
      }
    });

    let queueEmpty = 0;

    consumer.on('error', (err) => { artillery.log(err) });
    consumer.on('empty', (err) => { debug('queueEmpty:', queueEmpty); queueEmpty++; });

    consumer.start();

    this.sqsConsumer = consumer;
  }

  async createWorker() {
    const workerId = randomUUID();

    return {workerId};
  }

  async prepareWorker(workerId) {
  }

  async runWorker(workerId) {
    const lambda = new AWS.Lambda({ apiVersion: '2015-03-31', region: this.region });
    const event = {
      SQS_QUEUE_URL: this.sqsQueueUrl,
      SQS_REGION: this.region,
      WORKER_ID: workerId,
      ARTILLERY_ARGS: this.artilleryArgs,
      TEST_RUN_ID: this.testRunId,
    };

    debug('Lambda event:');
    debug({event});

    const args = Buffer.from(JSON.stringify(event));

    await lambda.invokeAsync({
      FunctionName: this.functionName,
      InvokeArgs: args,
    }).promise();
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
    const lambda = new AWS.Lambda({ apiVersion: '2015-03-31', region: this.region });

    try {
      await s3.deleteObject({
        Bucket: this.bucketName,
        Key: this.lambdaZipPath,
      }).promise();

      await sqs.deleteQueue({
        QueueUrl: this.sqsQueueUrl,
      }).promise();

      if (typeof process.env.RETAIN_LAMBDA === 'undefined') {
        await lambda.deleteFunction({
          FunctionName: this.functionName,
        }).promise();
      }
    } catch (err) {
      console.error(err);
    }
  }

  async createZip(src, out) {
    const archive = archiver('zip', { zlib: { level: 9 }});
    const stream = fs.createWriteStream(out);

    return new Promise((resolve, reject) => {
      archive
        .directory(src, false)
        .on('error', err => reject(err))
        .pipe(stream)
      ;

      stream.on('close', () => resolve());
      archive.finalize();
    });
  }

  // TODO: Move into reusable platform util
  async ensureS3BucketExists() {
    const accountId = await this.getAccountId();
    // S3 and Lambda have to be in the same region, which means we can't reuse
    // the bucket created by Pro to store Lambda deployment zips
    const bucketName = `artilleryio-test-data-${this.region}-${accountId}`;
    const s3 = new AWS.S3({ region: this.region });

    try {
      await s3.listObjectsV2({Bucket: bucketName, MaxKeys: 1}).promise();
    } catch (s3Err) {
      if (s3Err.code === 'NoSuchBucket') {
        const res = await s3.createBucket({ Bucket: bucketName }).promise();
      } else {
        throw s3Err;
      }
    }

    return bucketName;
  }

  // TODO: Move into reusable platform util
  async getAccountId() {
    let stsOpts = {};
    if(process.env.ARTILLERY_STS_OPTS) {
      stsOpts = Object.assign(stsOpts, JSON.parse(process.env.ARTILLERY_STS_OPTS));
    }

    const sts = new AWS.STS(stsOpts);
    const awsAccountId = (await sts.getCallerIdentity({}).promise()).Account;
    return awsAccountId;
  }

  // TODO: Add timestamp to SQS queue name for automatic GC
  async createSQSQueue() {
    const sqs = new AWS.SQS({
      region: this.region,
    });

    const SQS_QUEUES_NAME_PREFIX = 'artilleryio_test_metrics';

    // 36 is length of a UUUI v4 string
    const queueName = `${SQS_QUEUES_NAME_PREFIX}_${this.testRunId.slice(0, 36)}.fifo`;
    const params = {
      QueueName: queueName,
      Attributes: {
        FifoQueue: 'true',
        ContentBasedDeduplication: 'false',
        MessageRetentionPeriod: '1800',
        VisibilityTimeout: '600'
      }
    };

    let sqsQueueUrl;
    try {
      const result = await sqs.createQueue(params).promise();
      sqsQueueUrl = result.QueueUrl;
    } catch (err) {
      throw err;
    }

    // Wait for the queue to be available:
    let waited = 0;
    let ok = false;
    while (waited < 120 * 1000) {
      try {
        const results = await sqs.listQueues({ QueueNamePrefix: queueName }).promise();
        if (results.QueueUrls && results.QueueUrls.length === 1) {
          debug('SQS queue created:', queueName);
          ok = true;
          break;
        } else {
          await sleep(10 * 1000);
          waited += 10 * 1000;
        }
      } catch (err) {
        await sleep(10 * 1000);
        waited += 10 * 1000;
      }
    }

    if(!ok) {
      debug('Time out waiting for SQS queue:', queueName);
      throw new Error(`SQS queue could not be created`);
    }

    return sqsQueueUrl;
  }

  async createLambdaRole() {
    const ROLE_NAME = 'artilleryio-default-lambda-role';

    const iam = new AWS.IAM();

    try {
      const res = await iam.getRole({RoleName: ROLE_NAME}).promise();
      return res.Role.Arn
    } catch (err) {
      debug(err);
    }

    const res = await iam.createRole({
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
      RoleName: ROLE_NAME,
    }).promise();

    const lambdaRoleArn = res.Role.Arn;

    await iam.attachRolePolicy({
      PolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
      RoleName: ROLE_NAME,
    }).promise();

    await iam.attachRolePolicy({
      PolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole',
      RoleName: ROLE_NAME,
    }).promise();

    const iamRes = await iam.createPolicy({
      PolicyDocument: `{
        "Version": "2012-10-17",
        "Statement": [
          {
            "Effect": "Allow",
            "Action": ["sqs:*"],
            "Resource": "arn:aws:sqs:*:${this.accountId}:artilleryio*"
          }
        ]
      }
      `,
      PolicyName: 'artilleryio-lambda-policy',
      Path: '/',
    }).promise();

    await iam.attachRolePolicy({
      PolicyArn: iamRes.Policy.Arn,
      RoleName: ROLE_NAME,
    }).promise();

    return lambdaRoleArn;
  }

  async createLambda(opts) {
    const { bucketName, functionName, zipPath } = opts;

    const lambda = new AWS.Lambda({ apiVersion: '2015-03-31', region: this.region });
    const res = await lambda.createFunction({
      Code: {
        S3Bucket: bucketName,
        S3Key: zipPath,
      },
      FunctionName: functionName,
      Description: 'Artillery.io test',
      Handler: 'index.handler',
      MemorySize: 4096,
      PackageType: 'Zip',
      Runtime: 'nodejs14.x',
      Timeout: 900,
      // VpcConfig: {
      //   SecurityGroupIds: ['sg-3fbdef6a'],
      //   SubnetIds: ['subnet-31c6ea6b', 'subnet-7b17e530', 'subnet-a9aa48d0'],
      // },
      Role: this.lambdaRoleArn,
    }).promise();
  }

  async uploadLambdaZip(bucketName, zipfile) {
    const key = `lambda/${randomUUID()}.zip`;
    // TODO: Set lifecycle policy on the bucket/key prefix to delete after 24 hours
    const s3 = new AWS.S3();
    const s3res = await s3.putObject({
      Body: fs.createReadStream(zipfile),
      Bucket: bucketName,
      Key: key,
    }).promise();

    return key;
  }
}

module.exports = PlatformLambda;