/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const AWS = require('aws-sdk');
const { spawn, spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const path = require('path');
const fs = require('fs');
// const npm = require('npm');
const util = require('util');
// const { syncTestData } = require('./dependencies')

const TIMEOUT_THRESHOLD_MSEC = 20 * 1000;

const syncTestData = async (bucketName, testRunId) => {
  // const REMOTE_TEST_DATA_PATH = `${bucketName}/tests/${testRunId}`;

  //use aws s3 sync with child process
  const LOCAL_TEST_DATA_PATH = `/tmp/test_data/${testRunId}`;

  // const sync = spawn('aws', ['s3', 'sync', `s3://${REMOTE_TEST_DATA_PATH}`, LOCAL_TEST_DATA_PATH]);

  // //console.log files in directory LOCAL_TEST_DATA_PATH
  // const ls = spawn('ls', [LOCAL_TEST_DATA_PATH]);
  // ls.stdout.on('data', (data) => {
  //     console.log(`FILES:`)
  //     console.log(`stdout: ${data}`);
  // });
  const s3 = new AWS.S3();
  const params = {
    Bucket: bucketName,
    Prefix: `tests/${testRunId}`
  };
  const data = await s3.listObjectsV2(params).promise();

  if (!fs.existsSync(LOCAL_TEST_DATA_PATH)) {
    fs.mkdirSync(LOCAL_TEST_DATA_PATH, { recursive: true })
  }


  //TODO : review why I didn't use s3 sync here? I think it was because aws cli wasnt available in the env at the time
  for (const file of data.Contents) {
    const params = {
      Bucket: bucketName,
      Key: file.Key
    };
    const data = await s3.getObject(params).promise();
    const pathFile = path.basename(file.Key);
    const localPath = `${LOCAL_TEST_DATA_PATH}/${pathFile}`;

    console.log(`CWD IS`)
    console.log(process.cwd());
    console.log('LOCAL PATH IS');
    console.log(localPath);
    fs.writeFileSync(`${LOCAL_TEST_DATA_PATH}/${pathFile}`, data.Body);
  }

  for (const file of fs.readdirSync(LOCAL_TEST_DATA_PATH)) {
    console.log(file);
}
};

const installNpmDependencies = async (testDataLocation) => {
  process.chdir(testDataLocation);


  // install using spawn npm
  console.log("TRYING SPAWN SYNC")

  const res = await runProcess('npm', ['install', '--prefix', testDataLocation], { log: true, env: {
    HOME: testDataLocation,
  } });

  console.log(`FINISHED WITH NPM DEPS`)
  console.log(res)

  for (const file of fs.readdirSync(testDataLocation)) {
    console.log(file);
  }

  // process.chdir(originalDir);
}

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
  const TEST_DATA_LOCATION = `/tmp/test_data/${TEST_RUN_ID}`

  console.log('Syncing test data');
  await syncTestData(BUCKET, TEST_RUN_ID);
  
  console.log('Test data synced');

  await installNpmDependencies(TEST_DATA_LOCATION);
  console.log(`finished installing test data`)

  

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

  const currentPath = process.cwd();
  console.log(`CURRENT PATH`)
  console.log(currentPath)

  console.log("FILES HERE:")
  for (const file of fs.readdirSync(currentPath)) {
    console.log(file);
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
    console.log(`ERROR IS:`)
    console.log(res.err)
    console.log(`CODE IS:`)
    console.log(res.code)
    console.log(`STDOUT IS:`)
    console.log(res.stdout)
    console.log(`STDERR IS:`)
    console.log(res.stderr)
    console.log(`fULL res`)
    console.log(res)

    if (res.err) {
      console.log(`throwing err`)
      throw res.err;
    }

    if (err || code !== 0) {
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

  console.log(`ENV IS:`)
  console.log(env)

  // console.log("WHAT FOLDERS ARE HERE:")
  // const artilleryPluginPath = `${path.join(process.cwd(), '../../../var/task/node_modules/')}`
  // for (const file of fs.readdirSync(artilleryPluginPath)) {
  //   console.log(file);
  // }

  const artilleryPath = `/function/node_modules/artillery/`

  //check that artillery is there
  console.log("WHAT FOLDERS ARE IN ARTILLERY:")
  for (const file of fs.readdirSync(artilleryPath)) {
    console.log(file);
  }

  const res = await runProcess(
    'node',
    [ARTILLERY_BINARY_PATH || '/function/node_modules/artillery/bin/run'].concat(
      ARTILLERY_ARGS
    ),
    { env: {...env, HOME: '/tmp'}, log: true }
  );

  console.log(`RES IS:`)
  console.log(res)

  return res
}

const sleep = async function (n) {
  return new Promise((resolve, _reject) => {
    setTimeout(function () {
      resolve();
    }, n);
  });
};

async function runProcess(name, args, { env, log } = opts) {
  console.log(`RUNNING PROCESS ${name} WITH ARGS: ${args}`)
  // console.log(args)
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
