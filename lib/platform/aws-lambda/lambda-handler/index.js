/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const AWS = require('aws-sdk');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');

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
    ARTILLERY_BINARY_PATH
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
      ARTILLERY_DISABLE_TELEMETRY: 'true'
      // SHIP_LOGS: 'true',
    },
    ENV
  );

  return runProcess(
    NODE_BINARY_PATH || '/var/lang/bin/node',
    [ARTILLERY_BINARY_PATH || './node_modules/artillery/bin/run'].concat(
      ARTILLERY_ARGS
    ),
    { env, log: true }
  );
}

const sleep = async function (n) {
  return new Promise((resolve, _reject) => {
    setTimeout(function () {
      resolve();
    }, n);
  });
};

async function runProcess(name, args, { env, log } = opts) {
  return new Promise((resolve, reject) => {
    const proc = spawn(name, args, { env });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      if (log) {
        console.log(data.toString());
      }
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      if (log) {
        console.error(data.toString());
      }

      stderr += data.toString();
    });

    proc.once('close', (code) => {
      resolve({ stdout, stderr, code });
    });

    proc.on('error', (err) => {
      resolve({ stdout, stderr, err });
    });
  });
}

module.exports = { handler, runProcess, execArtillery };
