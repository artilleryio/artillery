const tap = require('tap');
const { execute } = require('../cli/_helpers.js');
const path = require('path');

tap.test('Workers should be able to set exit codes', async (t) => {
  const scenarioPath = path.resolve(
    __dirname,
    '..',
    'scripts',
    'test-suggest-exit-code.yml'
  );

  const [exitCode] = await execute(['run', scenarioPath]);
  t.ok(exitCode === 17, 'CLI exited with error code set in a worker thread');
});
