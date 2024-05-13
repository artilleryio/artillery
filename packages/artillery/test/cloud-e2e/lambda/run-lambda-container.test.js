const tap = require('tap');
const { $ } = require('zx');
const { getTestTags } = require('../../cli/_helpers.js');

tap.test('Run a test on AWS Lambda using containers', async (t) => {
  const tags = getTestTags(['type:acceptance']);
  const configPath = `${__dirname}/fixtures/quick-loop-with-csv/config.yml`;
  const scenarioPath = `${__dirname}/fixtures/quick-loop-with-csv/blitz.yml`;

  process.env.LAMBDA_IMAGE_VERSION = process.env.ECR_IMAGE_VERSION;

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
