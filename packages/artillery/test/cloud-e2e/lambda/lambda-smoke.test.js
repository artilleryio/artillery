const tap = require('tap');
const fs = require('fs');
const { $ } = require('zx');
const {
  getTestTags,
  generateTmpReportPath,
  getImageArchitecture
} = require('../../helpers');
const {
  checkForNegativeValues,
  checkAggregateCounterSums
} = require('../../helpers/expectations');

const tags = getTestTags(['type:acceptance']);

let reportFilePath;
tap.beforeEach(async (t) => {
  process.env.RETAIN_LAMBDA = 'false';
  reportFilePath = generateTmpReportPath(t.name, 'json');
});

const A9_PATH = process.env.A9_PATH || 'artillery';
const ARCHITECTURE = getImageArchitecture();

tap.before(async () => {
  await $`${A9_PATH} -V`;
});

//Note: we run this test always in x86_64 so we still run one x86_64 test in main pipeline as a smoke test
tap.test('Run a test on AWS Lambda using containers', async (t) => {
  const configPath = `${__dirname}/fixtures/quick-loop-with-csv/config.yml`;
  const scenarioPath = `${__dirname}/fixtures/quick-loop-with-csv/blitz.yml`;

  const output =
    await $`${A9_PATH} run-lambda --count 10 --region us-east-1 --architecture x86_64 --config ${configPath} --record --tags ${tags} ${scenarioPath}`;

  t.equal(output.exitCode, 0, 'CLI should exit with code 0');

  t.ok(
    output.stdout.indexOf('Summary report') > 0,
    'Should print summary report'
  );
  t.ok(
    output.stdout.indexOf('http.codes.200') > 0,
    'Should print http.codes.200'
  );

  t.ok(
    output.stdout.indexOf('csv_number_') > 0,
    'Should print csv_number_ counters'
  );

  t.ok(
    output.stdout.indexOf('csv_name_') > 0,
    'Should print csv_name_ counters'
  );
});

tap.test(
  'Run in Lambda container with typescript processor and external package',
  async (t) => {
    const scenarioPath = `${__dirname}/fixtures/ts-external-pkg/with-external-foreign-pkg.yml`;

    const output =
      await $`${A9_PATH} run-lambda ${scenarioPath} --architecture ${ARCHITECTURE} --record --output ${reportFilePath} --tags ${tags},typescript:true`;

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
  }
);
