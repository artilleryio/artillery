/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const AWS = require('aws-sdk');
const { randomUUID } = require('node:crypto');
const { runProcess, sleep } = require('./a9-handler-helpers');
const {
  syncTestData,
  installNpmDependencies
} = require('./a9-handler-dependencies');

const TIMEOUT_THRESHOLD_MSEC = 20 * 1000;

class MQ {
  constructor({ region, queueUrl, attrs }) {
    this.sqs = new AWS.SQS({ region });
    this.queueUrl = queueUrl;
    this.attrs = attrs;
  }

  async send(body) {
    const messageAttributes = Object.keys(this.attrs).reduce((acc, key) => {
      acc[key] = {
        DataType: 'String',
        StringValue: this.attrs[key]
      };
      return acc;
    }, {});

    return this.sqs
      .sendMessage({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(body),
        MessageAttributes: messageAttributes,
        MessageDeduplicationId: randomUUID(),
        MessageGroupId: this.attrs.testId
      })
      .promise();
  }
}

async function handler(event, context) {
  const {
    SQS_QUEUE_URL,
    SQS_REGION,
    TEST_RUN_ID,
    WORKER_ID,
    ARTILLERY_ARGS,
    BUCKET,
    ENV,
    WAIT_FOR_GREEN,
    IS_CONTAINER_LAMBDA
  } = event;

  console.log('TEST_RUN_ID: ', TEST_RUN_ID);

  const mq = new MQ({
    region: SQS_REGION,
    queueUrl: SQS_QUEUE_URL,
    attrs: {
      testId: TEST_RUN_ID,
      workerId: WORKER_ID
    }
  });

  const TEST_DATA_LOCATION = `/tmp/test_data/${TEST_RUN_ID}`;

  if (IS_CONTAINER_LAMBDA) {
    try {
      await syncTestData(BUCKET, TEST_RUN_ID);
    } catch (err) {
      await mq.send({
        event: 'workerError',
        reason: 'TestDataSyncFailure',
        logs: { err }
      });
    }

    try {
      await installNpmDependencies(TEST_DATA_LOCATION);
    } catch (err) {
      await mq.send({
        event: 'workerError',
        reason: 'InstallDependenciesFailure',
        logs: { err }
      });
    }
  }

  const interval = setInterval(async () => {
    const timeRemaining = context.getRemainingTimeInMillis();

    if (timeRemaining > TIMEOUT_THRESHOLD_MSEC) {
      return;
    }

    await mq.send({
      event: 'workerError',
      reason: 'AWSLambdaTimeout'
    });

    clearInterval(interval);
  }, 5000).unref();

  // TODO: Stop Artillery process - relying on Lambda runtime to shut everything down now

  const s3 = new AWS.S3();
  await mq.send({ event: 'workerReady' });

  let waitingFor = 0;
  const MAX_WAIT_MSEC = 3 * 60 * 1000;
  const SLEEP_MSEC = 2500;

  if (WAIT_FOR_GREEN) {
    while (waitingFor < MAX_WAIT_MSEC) {
      try {
        const params = {
          Bucket: BUCKET,
          Key: `/${TEST_RUN_ID}/green`
        };
        await s3.headObject(params).promise();
        break;
      } catch (_err) {
        await sleep(SLEEP_MSEC);
        waitingFor += SLEEP_MSEC;
      }
    }
  }

  try {
    const { err, code, stdout, stderr } = await execArtillery({
      SQS_QUEUE_URL,
      SQS_REGION,
      TEST_RUN_ID,
      WORKER_ID,
      ARTILLERY_ARGS,
      IS_CONTAINER_LAMBDA,
      TEST_DATA_LOCATION,
      ENV
    });

    if (err || code !== 0) {
      console.log(err);
      await mq.send({
        event: 'workerError',
        reason: 'ArtilleryError',
        logs: { stdout, stderr }
      });
    }
  } catch (err) {
    console.error(err);

    await mq.send({
      event: 'workerError',
      reason: 'StartupFailure',
      logs: { err }
    });
  }
}

async function execArtillery(options) {
  const {
    SQS_QUEUE_URL,
    SQS_REGION,
    TEST_RUN_ID,
    WORKER_ID,
    ARTILLERY_ARGS,
    ENV,
    NODE_BINARY_PATH,
    ARTILLERY_BINARY_PATH,
    IS_CONTAINER_LAMBDA,
    TEST_DATA_LOCATION
  } = options;

  const env = Object.assign(
    {},
    process.env,
    {
      ARTILLERY_PLUGINS: `{"sqs-reporter":{"region": "${SQS_REGION}"}}`,
      SQS_TAGS: `[{"key":"testId","value":"${TEST_RUN_ID}"},{"key":"workerId","value":"${WORKER_ID}"}]`,
      SQS_QUEUE_URL: SQS_QUEUE_URL,
      SQS_REGION: SQS_REGION,
      ARTILLERY_DISABLE_ENSURE: 'true',
      // Set test run ID for this Artillery process explicitly. This makes sure that $testId
      // template variable is set to the same value for all Lambda workers as the one user
      // sees on their terminal
      ARTILLERY_TEST_RUN_ID: TEST_RUN_ID
      // SHIP_LOGS: 'true',
    },
    ENV
  );

  let ARTILLERY_PATH =
    ARTILLERY_BINARY_PATH || './node_modules/artillery/bin/run';

  if (IS_CONTAINER_LAMBDA) {
    ARTILLERY_PATH = '/artillery/node_modules/artillery/bin/run';

    env.ARTILLERY_PLUGIN_PATH = `${TEST_DATA_LOCATION}/node_modules/`;
    env.HOME = '/tmp';
  }

  return runProcess(
    NODE_BINARY_PATH || 'node',
    [ARTILLERY_PATH].concat(ARTILLERY_ARGS),
    { env, log: true }
  );
}

module.exports = { handler, runProcess, execArtillery };
