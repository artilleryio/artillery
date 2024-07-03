const { test, before, beforeEach } = require('tap');
const { $ } = require('zx');
const fs = require('fs');
const path = require('path');
const { generateTmpReportPath, getTestTags } = require('../../helpers');
const {
  checkForNegativeValues,
  checkAggregateCounterSums
} = require('../../helpers/expectations');

const A9_PATH = process.env.A9_PATH || 'artillery';

before(async () => {
  await $`${A9_PATH} -V`;
});

//NOTE: all these tests report to Artillery Dashboard to dogfood and improve visibility
const baseTags = getTestTags(['type:acceptance']);
let reportFilePath;
beforeEach(async (t) => {
  reportFilePath = generateTmpReportPath(t.name, 'json');
});

test('Run with typescript processor and external package', async (t) => {
  const scenarioPath = `${__dirname}/fixtures/ts-external-pkg/with-external-foreign-pkg.yml`;

  const output =
    await $`${A9_PATH} run-fargate ${scenarioPath} --output ${reportFilePath} --record --tags ${baseTags},typescript:true`;

  t.equal(output.exitCode, 0, 'CLI Exit Code should be 0');

  const report = JSON.parse(fs.readFileSync(reportFilePath, 'utf8'));
  t.equal(
    report.aggregate.counters['http.codes.200'],
    2,
    'Should have made 2 requests'
  );
  t.equal(
    report.aggregate.counters['errors.invalid_address'],
    2,
    'Should have emitted 2 errors'
  );

  checkForNegativeValues(t, report);
  checkAggregateCounterSums(t, report);
});

test('Run a test with an ESM processor', async (t) => {
  // The main thing we're checking here is that ESM + dependencies get bundled correctly by BOM
  const scenarioPath = path.resolve(
    `${__dirname}/../../scripts/scenario-async-esm-hooks/test.yml`
  );

  const output =
    await $`${A9_PATH} run-fargate ${scenarioPath} --output ${reportFilePath} --record --tags ${baseTags}`;

  t.equal(output.exitCode, 0, 'CLI exit code should be 0');

  const report = JSON.parse(fs.readFileSync(reportFilePath, 'utf8'));
  t.equal(
    report.aggregate.counters['http.codes.200'],
    10,
    'Should have made 10 requests'
  );

  t.equal(
    report.aggregate.counters['hey_from_esm'],
    10,
    'Should have emitted 10 custom metrics from ts processor'
  );

  checkForNegativeValues(t, report);
  checkAggregateCounterSums(t, report);
});
