const { test, before, beforeEach } = require('tap');
const { $ } = require('zx');
const fs = require('fs');
const got = require('got');
const {
  generateTmpReportPath,
  getTestTags,
  getTestId
} = require('../../helpers');
const {
  checkForNegativeValues,
  checkAggregateCounterSums
} = require('../../helpers/expectations');

const A9_PATH = process.env.A9_PATH || 'artillery';

before(async () => {
  await $`${A9_PATH} -V`;
});

const baseTags = getTestTags(['type:acceptance']);

beforeEach(async (t) => {
  $.verbose = true;
  t.context.reportFilePath = generateTmpReportPath(t.name, 'json');
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
    t.ok(
      err.message.includes(
        'Error: API key is required to record test results to Artillery Cloud'
      ),
      'Should error if API key is not provided'
    );
  }

  // Run the test with the key provided in the dotenv file
  let output;
  try {
    output =
      await $`${A9_PATH} run-fargate ${scenarioPath} --output ${t.context.reportFilePath} --record --tags ${baseTags} --dotenv ${dotEnvPath}`;
  } catch (err) {
    console.log(err);
    t.error(
      err,
      'Should not have errored when running the test with the API key provided in the dotenv file'
    );
    t.ok(
      !err.message.includes(
        'Error: API key is required to record test results to Artillery Cloud'
      ),
      'The API key should be available when provided in the dotenv file'
    );
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
    t.error(
      err,
      'Should not have errored when getting the test from the Artillery Cloud API'
    );
  }
  console.log(`Response status: ${res?.statusCode} ${res?.statusMessage}`);

  const testData = JSON.parse(res.body);
  const report = JSON.parse(fs.readFileSync(t.context.reportFilePath, 'utf8'));

  // Assertions
  t.equal(output.exitCode, 0, 'CLI Exit Code should be 0');
  t.ok(
    output.stdout.includes(
      'Artillery Cloud reporting is configured for this test run'
    ),
    'Should have configured Artillery Cloud reporting'
  );
  t.equal(
    res.statusCode,
    200,
    'Should get a 200 response when getting the test by id from the Artillery Cloud API'
  );
  t.ok(
    t.equal(testData.id, testRunId, 'Correct test should be returned') &&
      t.match(
        testData?.report?.summary,
        report.summary,
        'Report data should match the report file'
      ),
    'Should have successfully recorded the test to Artillery Cloud'
  );

  fs.unlinkSync(dotEnvPath);
  checkForNegativeValues(t, report);
  checkAggregateCounterSums(t, report);
});
