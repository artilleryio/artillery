const { test, before, beforeEach } = require('tap');
const { $ } = require('zx');
const fs = require('fs');
const got = require('got');
const generateId = require('../../../lib/util/generate-id');
const region = 'us-east-1';
const AWS = require('aws-sdk');
const ecs = new AWS.ECS({
  apiVersion: '2014-11-13',
  region
});

const { generateTmpReportPath, getTestTags } = require('../../helpers');
const sleep = require('../../helpers/sleep');

const {
  checkForNegativeValues,
  checkAggregateCounterSums
} = require('../../helpers/expectations');

const A9_PATH = process.env.A9_PATH || 'artillery';
const baseTags = getTestTags(['type:acceptance']);

before(async () => {
  await $`${A9_PATH} -V`;
});

beforeEach(async (t) => {
  $.verbose = true;
  t.context.reportFilePath = generateTmpReportPath(t.name, 'json');
});

test('Correctly handles early task termination', async (t) => {
  const scenarioPath = `${__dirname}/fixtures/sigterm.yml`;
  // When SIGTERM is received, Artillery should exit with code 7
  const expectedExitCode = 7;
  process.env.ARTILLERY_TEST_RUN_ID = generateId('t');

  let testRunProcess;
  let exitCode;
  let output;

  // Callback func for both resolution and rejection of the testRunProcess promise below - in both cases the returned object should have the exitCode and stdout properties (if Artillery exits early like it should, the promise will be rejected)
  function setTestRunInfo(info) {
    exitCode = info?.exitCode;
    output = info?.stdout;
  }

  // We trigger the test run but do not await as we need to stop the Fargate task while the test is running
  testRunProcess =
    $`${A9_PATH} run-fargate ${scenarioPath} --output ${t.context.reportFilePath} --record --tags ${baseTags}`.then(
      setTestRunInfo,
      setTestRunInfo
    );

  // We use Artillery's Cloud API to get task ID and check if the test started
  const testRunCloudEndpoint = `${process.env.ARTILLERY_CLOUD_ENDPOINT}/api/load-tests/${process.env.ARTILLERY_TEST_RUN_ID}`;

  const maxRetry = 5;
  const delay = 30000;
  let retryNum = 0;
  let res;
  let testStarted;
  while (!testStarted && retryNum <= maxRetry) {
    await sleep(delay);
    try {
      res = await got(testRunCloudEndpoint, {
        headers: {
          'x-auth-token': process.env.ARTILLERY_CLOUD_API_KEY
        },
        throwHttpErrors: false
      });
    } catch (err) {
      t.error(`Error fetching data from Artillery Cloud API: ${err}`);
    }
    // Make sure the workers have started before stopping the task
    testStarted =
      res?.body &&
      JSON.parse(res.body).events?.some(
        (event) => event.eventName === 'phaseStarted'
      );
    retryNum++;
  }

  // Stop the task
  const taskId = JSON.parse(res.body).tasks?.[0];
  try {
    console.log('Stopping task: ', taskId);
    await ecs
      .stopTask({ task: taskId, cluster: 'artilleryio-cluster' })
      .promise();
  } catch (err) {
    t.error(`Error calling ecs.stopTask: ${err}`);
  }

  // We await for testRunProcess but set a 1m timeout to ensure Artillery exited early.
  const timeout = new Promise((resolve) => {
    setTimeout(() => {
      resolve(new Error('Artillery did not exit within 60s as expected.'));
    }, 60000);
  });

  try {
    await Promise.race([testRunProcess, timeout]);
  } catch (err) {
    t.fail(err.message);
  }

  const reportExists = fs.existsSync(t.context.reportFilePath);
  t.ok(exitCode && output, 'Artillery should exit early when task is stopped');
  t.equal(
    exitCode,
    expectedExitCode,
    `Exit code should be ${expectedExitCode}`
  );
  t.ok(output.includes('Summary report'), 'Should log the summary report');
  t.ok(reportExists, 'Should generate report file');

  if (reportExists) {
    const report = JSON.parse(
      fs.readFileSync(t.context.reportFilePath, 'utf8')
    );
    checkForNegativeValues(t, report);
    checkAggregateCounterSums(t, report);
  }
});
