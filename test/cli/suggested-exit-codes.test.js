const tap = require('tap');
const path = require('path');
const { $ } = require('zx');

async function main() {
  tap.test('Workers should be able to set exit codes', async (t) => {
    try {
      const result = await $`${path.join(
        __dirname,
        '../../bin/run'
      )} run ${path.join(
        __dirname,
        '../scripts/test-suggest-exit-code.yml'
      )} --quiet`;
      t.ok(false, 'Exit code not set properly');
    } catch (err) {
      t.ok(
        err.exitCode === 17,
        'CLI exited with error code set in a worker thread'
      );
    }
  });
}

main();
