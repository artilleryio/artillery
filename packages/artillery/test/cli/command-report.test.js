const tap = require('tap');
const { execute, returnTmpPath } = require('../cli/_helpers.js');

tap.test('If we report specifying output, no browser is opened', async (t) => {
  const outputFilePath = returnTmpPath('report.html');

  const [exitCode] = await execute([
    'report',
    '--output',
    outputFilePath,
    'test/scripts/report.json'
  ]);

  t.ok(exitCode === 0);
});
