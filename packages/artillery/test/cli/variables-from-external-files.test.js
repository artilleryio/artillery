const tap = require('tap');
const { execute } = require('../cli/_helpers.js');
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

  t.ok(
    exitCode === 0 &&
      output.stdout.includes('http.codes.200') &&
      !output.stdout.includes('http.codes.400')
  );
});
