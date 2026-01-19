const tap = require('tap');
const { execute } = require('../helpers');
const execa = require('execa');

/*
  We make sure that the CSV files are read and parsed properly by constructing
  URLs and payloads from the contents of those files. If we see any 400s in the
  log we know something went wrong.
*/

tap.test('Load variables from single CSV successfully', async (t) => {
  const abortController = new AbortController();
  execa('node', ['./test/targets/calc-server.js'], {
    env: { PORT: '1986' },
    signal: abortController.signal
  });

  const [exitCode, output] = await execute([
    'run',
    '--target',
    'http://127.0.0.1:1986',
    '--environment',
    'single-cli',
    './test/scripts/test-calc-server.yml',
    '-p',
    './test/data/calc-test-data-1.csv'
  ]);

  abortController.abort();

  t.equal(exitCode, 0, 'CLI should exit with code 0');
  t.ok(output.stdout.includes('http.codes.200'), 'Should have 200s');
  t.notOk(output.stdout.includes('http.codes.400'), 'Should not have 400s');
});

tap.test(
  'Load variables from CSV when using array payload and an environment from a config file',
  async (t) => {
    const [exitCode, output] = await execute([
      'run',
      '--environment',
      'staging',
      './test/scripts/scenario-payload-with-envs/scenario.yml',
      '--config',
      './test/scripts/scenario-payload-with-envs/config/artillery-config.yml'
    ]);

    t.equal(exitCode, 0, 'CLI should exit with code 0');
    t.ok(
      output.stdout.includes('Successfully ran with id'),
      'Should display success message'
    );
    t.ok(
      output.stdout.includes('abc12345') || output.stdout.includes('abc56789'),
      'Should include one of the ids from the csv'
    );
  }
);
