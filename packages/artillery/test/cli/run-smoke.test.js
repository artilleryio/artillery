const tap = require('tap');
const { execute } = require('../cli/_helpers.js');

tap.test(
  'Running with no arguments prints out usage information',
  async (t) => {
    const [exitCode, output] = await execute([]);
    t.ok(exitCode === 0 && output.stdout.includes('USAGE'));
  }
);

tap.test('artillery -V prints version number', async (t) => {
  const [exitCode, output] = await execute(['-V']);
  t.ok(exitCode === 0 && output.stdout.includes('VERSION INFO'));
});

tap.test('Artillery quick run successfully', async (t) => {
  const [exitCode, output] = await execute([
    'quick',
    '-c1',
    'https://artillery.io'
  ]);
  t.ok(exitCode === 0 && output.stdout.includes('All VUs finished'));
});
