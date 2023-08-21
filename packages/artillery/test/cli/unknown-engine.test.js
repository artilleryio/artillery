const tap = require('tap');
const { execute } = require('../cli/_helpers.js');

tap.test(
  'Throws when encountered an unknown engine in scenarios',
  async (t) => {
    const [exitCode, error] = await execute([
      'run',
      'test/scripts/unknown_engine.json'
    ]);

    console.log({ exitCode, error }, error.message);

    t.ok(exitCode !== 0);
    t.same(
      error.message,
      `Failed to run scenario "0": unknown engine "playwright". Did you forget to include it in "config.engines.playwright"?`
    );
  }
);
