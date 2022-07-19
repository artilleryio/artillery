/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const AWS = require('aws-sdk');
const { exec } = require('node:child_process');
const util = require('node:util');
const { randomUUID } = require('node:crypto');

const TIMEOUT_THRESHOLD_MSEC = 20 * 1000;

async function handler(event, context) {
  const { SQS_QUEUE_URL, SQS_REGION, TEST_RUN_ID, WORKER_ID, ARTILLERY_ARGS, ENV } = event;
  console.log('TEST_RUN_ID: ', TEST_RUN_ID);

  const interval = setInterval(async () => {
    const timeRemaining = context.getRemainingTimeInMillis();

    if (timeRemaining > TIMEOUT_THRESHOLD_MSEC) {
      return;
    }

    const sqs = new AWS.SQS({ region: SQS_REGION });
    await sqs.sendMessage({
      QueueUrl: SQS_QUEUE_URL,
      MessageBody: JSON.stringify({
        event: 'workerError',
        reason: 'AWSLambdaTimeout'
      }),
      MessageAttributes: {
        testId: {
          DataType: 'String',
          StringValue: TEST_RUN_ID,
        },
        workerId: {
          DataType: 'String',
          StringValue: WORKER_ID,
        }
      },
      MessageDeduplicationId: randomUUID(),
      MessageGroupId: TEST_RUN_ID,
    }).promise();

    clearInterval(interval);
  }, 5000).unref();

  // TODO: Stop Artillery process - relying on Lambda runtime to shut everything down now

  await execArtillery({
    SQS_QUEUE_URL,
    SQS_REGION,
    TEST_RUN_ID,
    WORKER_ID,
    ARTILLERY_ARGS,
    ENV
  });
}

async function execArtillery(options) {;
  const {
    SQS_QUEUE_URL,
    SQS_REGION,
    TEST_RUN_ID,
    WORKER_ID,
    ARTILLERY_ARGS,
    ENV,
  } = options;

  try {
    const env = Object.assign({}, process.env, {
      ARTILLERY_PLUGINS: `{"sqs-reporter":{"region": "${SQS_REGION}"}}`,
      SQS_TAGS: `[{"key":"testId","value":"${TEST_RUN_ID}"},{"key":"workerId","value":"${WORKER_ID}"}]`,
      SQS_QUEUE_URL: SQS_QUEUE_URL,
      SQS_REGION: SQS_REGION,
      ARTILLERY_DISABLE_ENSURE: 'true',
      ARTILLERY_DISABLE_TELEMETRY: 'true',
      // SHIP_LOGS: 'true',
    }, ENV);

    const { stdout, stderr } = await runProcess('/var/lang/bin/node ./node_modules/.bin/artillery', ARTILLERY_ARGS, {
      env
    });

    console.log(stdout);
    console.log(stderr);
  } catch (err) {
    console.log('exec error');
    console.log(err);
  }
}

const sleep = async function(n) {
  return new Promise((resolve, _reject) => {
    setTimeout(function() {
      resolve();
    }, n);
  });
}

// TODO: Replace exec with spawn()
async function runProcess(name, args, opts) {
  const execp = util.promisify(exec);

  const { stdout, stderr } = await execp(`${name} ${args.join(' ')}`, { env: opts.env });
  return { stdout, stderr };
}

exports.handler = handler;
