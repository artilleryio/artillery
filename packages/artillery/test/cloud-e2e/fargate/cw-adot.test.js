'use strict';

const { test, afterEach, beforeEach, before } = require('tap');
const { $ } = require('zx');
const fs = require('fs');
const {
  generateTmpReportPath,
  deleteFile,
  getTestTags,
  getTestId
} = require('../../helpers');
const { getXRayTraces } = require('./fixtures/adot/helpers.js');
const {
  checkForNegativeValues,
  checkAggregateCounterSums
} = require('../../helpers/expectations');

const A9_PATH = process.env.A9_PATH || 'artillery';
// NOTE: This test reports to Artillery Dashboard to dogfood and improve visibility
const baseTags = getTestTags(['type:acceptance']);

let reportFilePath;
beforeEach(async (t) => {
  reportFilePath = generateTmpReportPath(t.name, 'json');
});

afterEach(async (t) => {
  deleteFile(reportFilePath);
});

before(async () => {
  await $`${A9_PATH} -V`;
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
    await $`${A9_PATH} run-fargate ${__dirname}/fixtures/adot/adot-cloudwatch.yml --record --tags ${baseTags} --output ${reportFilePath}`;

  const testId = getTestId(output.stdout);
  const report = JSON.parse(fs.readFileSync(reportFilePath, 'utf8'));
  checkForNegativeValues(t, report);
  checkAggregateCounterSums(t, report);

  let traceMap;
  try {
    traceMap = await getXRayTraces(testId, expectedVus);
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
