'use strict';

const { test, afterEach, beforeEach } = require('tap');
const { $ } = require('zx');
const fs = require('fs');
const {
  generateTmpReportPath,
  deleteFile,
  getTestTags
} = require('../../cli/_helpers.js');

const {
  getDatadogSpans,
  getTestId,
  getXRayTraces
} = require('./fixtures/adot/helpers.js');
const exp = require('constants');

//NOTE: all these tests report to Artillery Dashboard to dogfood and improve visibility
const baseTags = getTestTags(['type:acceptance']);

let reportFilePath;
beforeEach(async (t) => {
  reportFilePath = generateTmpReportPath(t.name, 'json');
});

afterEach(async (t) => {
  deleteFile(reportFilePath);
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
  const expectedTotalSpans = 52; // 4 VUs * (1 scenario root span + 2 requests + 10 timing zone spans (5 per request))
  const expectedVus = 4;
  const expectedRequests = 8;
  const expectedStatusCode200 = 8;
  const expectedVusFailed = 0;
  const tag = { key: 'testType', value: 'e2e' };

  // Act:
  const output =
    await $`artillery run-fargate ${__dirname}/fixtures/adot/adot-dd-pass.yml --record --tags ${baseTags} --output ${reportFilePath}`;

  const testId = getTestId(output.stdout);
  const report = JSON.parse(fs.readFileSync(reportFilePath, 'utf8'));

  let spanList;
  try {
    spanList = await getDatadogSpans(
      apiKey,
      appKey,
      testId,
      expectedTotalSpans
    );
  } catch (err) {
    t.fail('Error getting spans from Datadog: ' + err);
  }

  const vuSpans = spanList.filter((span) => span.attributes.parent_id === '0');
  const requestSpans = spanList.filter(
    (span) => span?.attributes?.resource_name === ('GET' || 'POST')
  );

  // Assert
  t.equal(output.exitCode, 0, 'CLI Exit Code should be 0');
  t.equal(
    spanList.length,
    expectedTotalSpans,
    `${expectedTotalSpans} spans in total should have arrived to Datadog`
  );
  t.equal(
    report.aggregate.counters['vusers.created'],
    expectedVus,
    `${expectedVus} VUs should have been created`
  );
  t.equal(
    vuSpans.length,
    report.aggregate.counters['vusers.created'],
    'Num of traces (root spans) in Datadog should match num of vusers created in report'
  );
  t.equal(
    requestSpans.length,
    expectedRequests,
    `${expectedRequests} request spans should have arrived to Datadog`
  );
  t.equal(
    report.aggregate.counters['http.codes.200'],
    expectedStatusCode200,
    `Should have ${expectedStatusCode200} "200 OK" responses`
  );
  t.equal(
    requestSpans.filter(
      (span) => span?.attributes?.custom?.http?.status_code === '200'
    ).length,
    report.aggregate.counters['http.codes.200'],
    'Num of request spans with status_code 200 in Datadog should match num of 200 OK responses in report'
  );
  t.equal(
    report.aggregate.counters['vusers.failed'],
    expectedVusFailed,
    `Should have ${expectedVusFailed} failed VUs`
  );
  t.equal(
    vuSpans.filter((span) => span.attributes.custom.error).length,
    expectedVusFailed,
    'Num of traces with error should match failed VUs in report'
  );
  t.hasProp(
    requestSpans[0]?.attributes?.custom,
    tag.key,
    'Request span should have the correct tag set from reporters config'
  );
  t.equal(
    requestSpans[0]?.attributes?.custom[tag.key],
    tag.value,
    'Request span should have the correct tag value set from reporters config'
  );
});

test('traces succesfully arrive to cloudwatch', async (t) => {
  // Arrange:

  const expectedTotalSpans = 28; // 4 VUs * (1 scenario root span + 3 pageSpans + 3 stepSpans )
  const expectedVus = 4;
  const expectedSpansPerVu = 7;
  const expectedStepSpansPerVu = 3;
  const expectedPageSpansPerVu = 3;
  const annotation = { testType: 'e2e' };
  const scenarioName = 'adot-e2e';
  const expectedVusFailed = 0;

  // Act:
  const output =
    await $`artillery run-fargate ${__dirname}/fixtures/adot/adot-cloudwatch.yml --record --tags ${baseTags} --output ${reportFilePath}`;

  const testId = getTestId(output.stdout);
  const report = JSON.parse(fs.readFileSync(reportFilePath, 'utf8'));

  let traceMap;
  try {
    traceMap = await getXRayTraces(testId);
  } catch (err) {
    t.fail('Error getting spans from Cloudwatch: ' + err);
  }

  const fullSpanObjects = [];

  t.equal(output.exitCode, 0, 'CLI Exit Code should be 0');
  t.equal(
    traceMap.reduce((acc, trace) => acc + trace.length, 0),
    expectedTotalSpans,
    'Total num of spans in AWS XRay should match expected Total Spans'
  );
  t.equal(
    traceMap.length,
    report.aggregate.counters['vusers.created'],
    'Num of traces arrived to AWS XRay should match num of vusers created in report'
  );
  t.equal(
    report.aggregate.counters['vusers.created'],
    expectedVus,
    `${expectedVus} VUs should have been created`
  );

  traceMap.forEach((trace) => {
    fullSpanObjects.push(trace.filter((span) => span.name === scenarioName)[0]);
    fullSpanObjects.concat(
      trace.filter((span) => span.name === scenarioName)[0]?.subsegments
    );
    t.equal(
      trace.length,
      expectedSpansPerVu,
      `Each trace should have ${expectedSpansPerVu} spans total`
    );
    t.equal(
      trace.filter((span) => span.name === scenarioName).length,
      1,
      'Each trace should have one scenario span'
    );
    t.equal(
      trace.filter((span) => span.name.includes('Page: ')).length,
      expectedPageSpansPerVu,
      'Each trace should have 3 page spans'
    );
    t.equal(
      trace.filter((span) => !span.name.includes('Page: ')).length - 1,
      expectedStepSpansPerVu,
      'Each trace should have 3 step spans'
    );
    t.equal(
      trace.filter((span) => !!span.error).length,
      expectedVusFailed,
      'Each trace should have 0 failed VUs'
    );
    t.equal(
      trace.filter((span) => span.parent_id).length,
      trace.filter((span) => span.name === scenarioName)[0]?.subsegments
        ?.length,
      'All page and step spans should be nested under scenario span'
    );
  });

  t.ok(
    fullSpanObjects.every(
      (span) => span?.annotations?.testType === annotation.testType
    ),
    'All spans should have the correct annotation set from test script'
  );
  t.ok(
    fullSpanObjects.every((span) => span?.annotations?.test_id === testId),
    'All spans should have the correct test id annotation set'
  );
  t.equal(
    report.aggregate.counters['vusers.failed'],
    expectedVusFailed,
    'Should have 0 failed VUs'
  );
  t.equal(
    traceMap.filter((trace) => trace.some((span) => !!span.error)).length,
    report.aggregate.counters['vusers.failed'],
    'Num of traces with error should match failed VUs in report'
  );
});
