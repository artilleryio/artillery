/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { randomUUID } = require('node:crypto');
const { runProcess, sleep } = require('./a9-handler-helpers');
const {
  syncTestData,
  installNpmDependencies
} = require('./a9-handler-dependencies');
const path = require('path');

const TIMEOUT_THRESHOLD_MSEC = 20 * 1000;

class MQ {
  constructor({ region, queueUrl, attrs }) {
    this.sqs = new SQSClient({ region });
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

    return this.sqs.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(body),
        MessageAttributes: messageAttributes,
        MessageDeduplicationId: randomUUID(),
        MessageGroupId: this.attrs.testId
      })
    );
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
    ARTILLERY_CLOUD_API_KEY
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

  try {
    await syncTestData(BUCKET, TEST_RUN_ID);
  } catch (err) {
    await mq.send({
      event: 'workerError',
      reason: 'TestDataSyncFailure',
      logs: {
        err: {
          message: err.message,
          stack: err.stack
        }
      }
    });
  }

  try {
    await installNpmDependencies(TEST_DATA_LOCATION);
  } catch (err) {
    await mq.send({
      event: 'workerError',
      reason: 'InstallDependenciesFailure',
      logs: {
        err: {
          message: err.message,
          stack: err.stack
        }
      }
    });
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

  const s3 = new S3Client();
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
        await s3.send(new HeadObjectCommand(params));
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
      TEST_DATA_LOCATION,
      ENV,
      ARTILLERY_CLOUD_API_KEY
    });

    if (err || code !== 0) {
      console.log(err);
      await mq.send({
        event: 'workerError',
        reason: 'ArtilleryError',
        exitCode: code,
        logs: { stdout, stderr }
      });
    }
  } catch (err) {
    console.error(err);

    await mq.send({
      event: 'workerError',
      reason: 'StartupFailure',
      logs: {
        err: {
          message: err.message,
          stack: err.stack
        }
      }
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
    TEST_DATA_LOCATION,
    ARTILLERY_CLOUD_API_KEY
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
      WORKER_ID: WORKER_ID,
      // Set test run ID for this Artillery process explicitly. This makes sure that $testId
      // template variable is set to the same value for all Lambda workers as the one user
      // sees on their terminal
      ARTILLERY_TEST_RUN_ID: TEST_RUN_ID
      // SHIP_LOGS: 'true',
    },
    ARTILLERY_CLOUD_API_KEY ? { ARTILLERY_CLOUD_API_KEY } : {},
    ENV
  );

  const TEST_DATA_NODE_MODULES = `${TEST_DATA_LOCATION}/node_modules`;
  const ARTILLERY_NODE_MODULES = '/artillery/node_modules';
  const ARTILLERY_PATH =
    ARTILLERY_BINARY_PATH || `${ARTILLERY_NODE_MODULES}/artillery/bin/run`;

  // Set the plugin path to the legacy SQS plugin as well as to user's test data for third party plugins
  env.ARTILLERY_PLUGIN_PATH = `${TEST_DATA_NODE_MODULES}:${ARTILLERY_NODE_MODULES}/artillery/lib/platform/aws-ecs/legacy/plugins`;
  env.HOME = '/tmp';
  env.NODE_PATH = ['/artillery/node_modules', TEST_DATA_NODE_MODULES].join(
    path.delimiter
  );

  return runProcess(
    NODE_BINARY_PATH || 'node',
    [ARTILLERY_PATH].concat(ARTILLERY_ARGS),
    { env, log: true }
  );
}

module.exports = { handler, runProcess, execArtillery };
