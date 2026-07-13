const tap = require('node:test');
const assert = require('node:assert');
const { execute } = require('../helpers');

tap.test(
  'Running with no arguments prints out usage information',
  async (_t) => {
    const [exitCode, output] = await execute([]);

    assert.strictEqual(exitCode, 0, 'CLI should exit with code 0');
    assert.ok(output.stdout.includes('USAGE'), 'Should print usage information');
  }
);

tap.test('artillery -V prints version number', async (_t) => {
  const [exitCode, output] = await execute(['-V']);

  assert.strictEqual(exitCode, 0, 'CLI should exit with code 0');
  assert.ok(output.stdout.includes('VERSION INFO'), 'Should print version information');
});

tap.test('Artillery quick run successfully', async (_t) => {
  const [exitCode, output] = await execute([
    'quick',
    '-c1',
    'https://artillery.io'
  ]);

  assert.strictEqual(exitCode, 0, 'CLI should exit with code 0');
  assert.ok(output.stdout.includes('All VUs finished'), 'Should print success message');
});
