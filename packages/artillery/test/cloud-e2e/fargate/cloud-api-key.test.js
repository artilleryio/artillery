const { test, before, beforeEach } = require('node:test');
const assert = require('node:assert');

// Per-test state (was tap's t.context; node:test has no context bag)
const ctx = {};
const { $ } = require('zx');
const fs = require('node:fs');
let got;
before(async () => { got = (await import('got')).default; });
const {
  generateTmpReportPath,
  getTestTags,
  getTestId
} = require('../../helpers');
const {
  checkForNegativeValues,
  checkAggregateCounterSums,
  hasSubset
} = require('../../helpers/expectations');

const A9_PATH = process.env.A9_PATH || 'artillery';

before(async () => {
  await $`${A9_PATH} -V`;
});

const baseTags = getTestTags(['type:acceptance']);

beforeEach(async (t) => {
  $.verbose = true;
  ctx.reportFilePath = generateTmpReportPath(t.name, 'json');
});

test('Cloud API key gets loaded from dotenv on Fargate runs', async (t) => {
  const scenarioPath = `${__dirname}/fixtures/cloud-api-key-load/scenario.yml`;
  const dotEnvPath = `${__dirname}/fixtures/cloud-api-key-load/cloud-key-env`;

  // Move the key from process.env to the dotenv file so we can test if it is being properly loaded
  fs.writeFileSync(
    dotEnvPath,
    `ARTILLERY_CLOUD_API_KEY=${process.env.ARTILLERY_CLOUD_API_KEY}`
  );
  delete process.env.ARTILLERY_CLOUD_API_KEY;

  // Run the test without it to make sure the key is not available without the dotenv file
  try {
    await $`${A9_PATH} run-fargate ${scenarioPath} --record --tags ${baseTags}`;
  } catch (err) {
    console.log('Error in test run without API key: ', err.message);
    assert.ok(err.message.includes(
        'Error: API key is required to record test results to Artillery Cloud'
      ), 'Should error if API key is not provided');
  }

  // Run the test with the key provided in the dotenv file
  let output;
  try {
    output =
      await $`${A9_PATH} run-fargate ${scenarioPath} --output ${ctx.reportFilePath} --record --tags ${baseTags} --dotenv ${dotEnvPath}`;
  } catch (err) {
    console.log(err);
    assert.ifError(err);
    assert.ok(!err.message.includes(
        'Error: API key is required to record test results to Artillery Cloud'
      ), 'The API key should be available when provided in the dotenv file');
  }

  // Get the test from the Artillery Cloud API
  const testRunId = getTestId(output.stdout);
  const testRunCloudEndpoint = `${
    process.env.ARTILLERY_CLOUD_ENDPOINT || 'https://app.artillery.io'
  }/api/load-tests/${testRunId}`;
  console.log('Test run Cloud API endpoint: ', testRunCloudEndpoint);

  let res;
  try {
    res = await got(testRunCloudEndpoint, {
      headers: {
        'x-auth-token': `${fs
          .readFileSync(dotEnvPath, 'utf8')
          .split('=')[1]
          .trim()}`
      },
      throwHttpErrors: false
    });
  } catch (err) {
    assert.ifError(err);
  }
  console.log(`Response status: ${res?.statusCode} ${res?.statusMessage}`);

  const testData = JSON.parse(res.body);
  const report = JSON.parse(fs.readFileSync(ctx.reportFilePath, 'utf8'));

  // Assertions
  assert.strictEqual(output.exitCode, 0, 'CLI Exit Code should be 0');
  assert.ok(output.stdout.includes(
      'Artillery Cloud reporting is configured for this test run'
    ), 'Should have configured Artillery Cloud reporting');
  assert.strictEqual(res.statusCode, 200, 'Should get a 200 response when getting the test by id from the Artillery Cloud API');
  // (was a tap-style t.equal/t.match combo left over from the node:test
  // migration - node:test's t has neither method)
  assert.strictEqual(
    testData.id,
    testRunId,
    'Correct test should be returned - should have successfully recorded the test to Artillery Cloud'
  );
  if (report.summary !== undefined) {
    hasSubset(
      testData?.report?.summary,
      report.summary,
      'Report data should match the report file'
    );
  }

  fs.unlinkSync(dotEnvPath);
  checkForNegativeValues(t, report);
  checkAggregateCounterSums(t, report);
});
