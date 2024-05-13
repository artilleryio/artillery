const tap = require('tap');
const fs = require('fs');
const { $ } = require('zx');
const { getTestTags, generateTmpReportPath } = require('../../cli/_helpers.js');

const tags = getTestTags(['type:acceptance']);

let reportFilePath;
tap.beforeEach(async (t) => {
  process.env.LAMBDA_IMAGE_VERSION = process.env.ECR_IMAGE_VERSION;
  reportFilePath = generateTmpReportPath(t.name, 'json');
});

tap.test('Run a test on AWS Lambda using containers', async (t) => {
  const configPath = `${__dirname}/fixtures/quick-loop-with-csv/config.yml`;
  const scenarioPath = `${__dirname}/fixtures/quick-loop-with-csv/blitz.yml`;

  const output =
    await $`artillery run-lambda --count 10 --region us-east-1 --container --config ${configPath} --record --tags ${tags} ${scenarioPath}`;

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
      await $`artillery run-lambda ${scenarioPath} --container --record --output ${reportFilePath} --tags ${tags},typescript:true`;

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
  }
);
