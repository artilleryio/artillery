const tap = require('tap');
const { execute } = require('../cli/_helpers.js');

tap.test(
  'Throws when encountered an unknown engine in scenarios',
  async (t) => {
    const [exitCode, output] = await execute([
      'run',
      'test/scripts/unknown_engine.json'
    ]);

    t.ok(exitCode === 11);
    t.ok(
      output.stdout.includes(
        'Failed to run scenario "0": unknown engine "playwright". Did you forget to include it in "config.engines.playwright"?'
      ),
      'Error message about missing "config[engineName]" is not being printed'
    );
  }
);
