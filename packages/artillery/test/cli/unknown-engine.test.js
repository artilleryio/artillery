const tap = require('node:test');
const assert = require('node:assert');
const { execute } = require('../helpers');

tap.test(
  'Throws when encountered an unknown engine in scenarios',
  async (_t) => {
    const [exitCode, output] = await execute([
      'run',
      'test/scripts/unknown_engine.json'
    ]);

    assert.strictEqual(exitCode, 11, 'CLI should exit with code 11');
    assert.ok(output.stdout.includes(
        'Failed to run scenario "0": unknown engine "playwright". Did you forget to include it in "config.engines.playwright"?'
      ), 'Error message about missing "config[engineName]" is not being printed');
  }
);
