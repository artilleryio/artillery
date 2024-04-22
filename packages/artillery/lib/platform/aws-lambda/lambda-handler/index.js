/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const AWS = require('aws-sdk');
const { randomUUID } = require('node:crypto');
const fs = require('fs');
const util = require('util');
const { syncTestData, installNpmDependencies } = require('./dependencies')
const { runProcess, sleep } = require('./helpers');

const TIMEOUT_THRESHOLD_MSEC = 20 * 1000;

class MQ {
  constructor({ region, queueUrl, attrs } = opts) {
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
  console.log(`CALLING HANDLER`)
  const {
    SQS_QUEUE_URL,
    SQS_REGION,
    TEST_RUN_ID,
    WORKER_ID,
    ARTILLERY_ARGS,
    BUCKET,
    ENV,
    WAIT_FOR_GREEN
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
  const TEST_DATA_LOCATION = `/tmp/test_data/${TEST_RUN_ID}`

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
    console.log(`ARTILLERY ARGS`)
    console.log(ARTILLERY_ARGS)
    const res = await execArtillery({
      SQS_QUEUE_URL,
      SQS_REGION,
      TEST_RUN_ID,
      WORKER_ID,
      ARTILLERY_ARGS,
      ENV,
      TEST_DATA_LOCATION
    });

    if (res.err || res.code !== 0) {
      console.log(err);
      await mq.send({
        event: 'workerError',
        reason: 'ArtilleryError',
        logs: { stdout, stderr }
      });
    }
  } catch (err) {
    console.log(`ERROR from CATCH IS:`)
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
      // NODE_PATH: `${process.cwd()}/node_modules`,
      // ARTILLERY_PLUGIN_PATH: `${path.join(process.cwd(), '../../../var/task/node_modules/')}`,
      ARTILLERY_PLUGIN_PATH: `${TEST_DATA_LOCATION}/node_modules/`,
      // Set test run ID for this Artillery process explicitly. This makes sure that $testId
      // template variable is set to the same value for all Lambda workers as the one user
      // sees on their terminal
      ARTILLERY_TEST_RUN_ID: TEST_RUN_ID
      // SHIP_LOGS: 'true',
    },
    ENV
  );

  const artilleryPath = `/artillery/node_modules/artillery/`

  //check that artillery is there
  console.log("WHAT FOLDERS ARE IN ARTILLERY:")
  for (const file of fs.readdirSync(artilleryPath)) {
    console.log(file);
  }

  const res = await runProcess(
    'node',
    [ARTILLERY_BINARY_PATH || '/artillery/node_modules/artillery/bin/run'].concat(
      ARTILLERY_ARGS
    ),
    { env: {...env, HOME: '/tmp'}, log: true }
  );

  console.log(`RES FROM ARTILLERY IS:`)
  console.log(res)

  return res
}

module.exports = { handler, runProcess, execArtillery };
