const tap = require('tap');
const { execute } = require('../../cli/_helpers.js');

tap.test('Run a test on AWS Lambda', async (t) => {
  const [exitCode, output] = await execute([
    'run:lambda',
    '--count',
    '10',
    '--region',
    'eu-west-1',
    '--config',
    './test/cloud-e2e/lambda/fixtures/quick-loop-with-csv/config.yml',
    './test/cloud-e2e/lambda/fixtures/quick-loop-with-csv/blitz.yml'
  ]);

  t.equal(exitCode, 0, 'CLI should exit with code 0');

  t.ok(
    output.stdout.indexOf('Summary report') > 0,
    'Should print summary report'
  );
  t.ok(
    output.stdout.indexOf('http.codes.200') > 0,
    'Should print http.codes.200'
  );
});
