const tap = require('tap');
const { execute } = require('../helpers');

tap.test(
  'Running with no arguments prints out usage information',
  async (t) => {
    const [exitCode, output] = await execute([]);

    t.equal(exitCode, 0, 'CLI should exit with code 0');
    t.ok(output.stdout.includes('USAGE'), 'Should print usage information');
  }
);

tap.test('artillery -V prints version number', async (t) => {
  const [exitCode, output] = await execute(['-V']);

  t.equal(exitCode, 0, 'CLI should exit with code 0');
  t.ok(
    output.stdout.includes('VERSION INFO'),
    'Should print version information'
  );
});

tap.test('Artillery quick run successfully', async (t) => {
  const [exitCode, output] = await execute([
    'quick',
    '-c1',
    'https://artillery.io'
  ]);

  t.equal(exitCode, 0, 'CLI should exit with code 0');
  t.ok(
    output.stdout.includes('All VUs finished'),
    'Should print success message'
  );
});
