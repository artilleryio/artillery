

const { test, afterEach, beforeEach, before } = require('node:test');
const assert = require('node:assert');
const { $ } = require('zx');
const fs = require('node:fs');
const {
  generateTmpReportPath,
  deleteFile,
  getTestTags,
  getTestId
} = require('../../helpers');
const {
  checkForNegativeValues,
  checkAggregateCounterSums
} = require('../../helpers/expectations');
const { getDatadogSpans } = require('./fixtures/adot/helpers.js');

const A9_PATH = process.env.A9_PATH || 'artillery';
//NOTE: This test reports to Artillery Dashboard to dogfood and improve visibility
const baseTags = getTestTags(['type:acceptance']);

let reportFilePath;
beforeEach(async (t) => {
  reportFilePath = generateTmpReportPath(t.name, 'json');
});

afterEach(async (_t) => {
  deleteFile(reportFilePath);
});

before(async () => {
  await $`${A9_PATH} -V`;
});

test('traces succesfully arrive to datadog', async (t) => {
  // Arrange:
  const apiKey = process.env.DD_TESTS_API_KEY;
  const appKey = process.env.DD_TESTS_APP_KEY;

  if (!apiKey || !appKey) {
    // Skipping test in case of running locally without DD keys
    t.skip('Skipping test, missing Datadog API key or App key');
  }

  /// Expected values
  const expectedTotalSpans = 12; // 4 VUs * (1 scenario root span + 2 requests)
  const expectedVus = 4;
  const expectedRequests = 8;
  const expectedStatusCode200 = 8;
  const expectedVusFailed = 0;
  const tag = { key: 'testType', value: 'e2e' };

  // Act:
  const output =
    await $`${A9_PATH} run-fargate ${__dirname}/fixtures/adot/adot-dd-pass.yml --record --tags ${baseTags} --output ${reportFilePath}`;

  const testId = getTestId(output.stdout);
  const report = JSON.parse(fs.readFileSync(reportFilePath, 'utf8'));
  checkForNegativeValues(t, report);
  checkAggregateCounterSums(t, report);

  let spanList;
  try {
    spanList = await getDatadogSpans(
      apiKey,
      appKey,
      testId,
      expectedTotalSpans
    );
  } catch (err) {
    assert.fail(`Error getting spans from Datadog: ${err}`);
  }

  const vuSpans = spanList.filter((span) => span.attributes.parent_id === '0');
  const requestSpans = spanList.filter(
    (span) => span?.attributes?.resource_name === ('GET' || 'POST')
  );

  // Assert
  assert.strictEqual(output.exitCode, 0, 'CLI Exit Code should be 0');
  assert.strictEqual(spanList.length, expectedTotalSpans, `${expectedTotalSpans} spans in total should have arrived to Datadog`);
  assert.strictEqual(report.aggregate.counters['vusers.created'], expectedVus, `${expectedVus} VUs should have been created`);
  assert.strictEqual(vuSpans.length, report.aggregate.counters['vusers.created'], 'Num of traces (root spans) in Datadog should match num of vusers created in report');
  assert.strictEqual(requestSpans.length, expectedRequests, `${expectedRequests} request spans should have arrived to Datadog`);
  assert.strictEqual(report.aggregate.counters['http.codes.200'], expectedStatusCode200, `Should have ${expectedStatusCode200} "200 OK" responses`);
  assert.strictEqual(requestSpans.filter(
      (span) => span?.attributes?.custom?.http?.status_code === '200'
    ).length, report.aggregate.counters['http.codes.200'], 'Num of request spans with status_code 200 in Datadog should match num of 200 OK responses in report');
  assert.strictEqual(report.aggregate.counters['vusers.failed'], expectedVusFailed, `Should have ${expectedVusFailed} failed VUs`);
  assert.strictEqual(vuSpans.filter((span) => span.attributes.custom.error).length, expectedVusFailed, 'Num of traces with error should match failed VUs in report');
  assert.ok(tag.key in requestSpans[0]?.attributes?.custom, 'Request span should have the correct tag set from reporters config');
  assert.strictEqual(requestSpans[0]?.attributes?.custom[tag.key], tag.value, 'Request span should have the correct tag value set from reporters config');
});
