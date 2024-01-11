const tap = require('tap');
const { $ } = require('zx');

tap.test('Run a test on AWS Lambda', async (t) => {
  const configPath = `${__dirname}/fixtures/quick-loop-with-csv/config.yml`;
  const scenarioPath = `${__dirname}/fixtures/quick-loop-with-csv/blitz.yml`;

  const output =
    await $`artillery run-lambda --count 10 --region eu-west-1 --config ${configPath} ${scenarioPath}`;

  t.equal(output.exitCode, 0, 'CLI should exit with code 0');

  t.ok(
    output.stdout.indexOf('Summary report') > 0,
    'Should print summary report'
  );
  t.ok(
    output.stdout.indexOf('http.codes.200') > 0,
    'Should print http.codes.200'
  );
});
