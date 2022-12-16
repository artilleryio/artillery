const tap = require('tap');
const { execute, deleteFile } = require('../cli/_helpers.js');
const path = require('path');

tap.test('If we report specifying output, no browser is opened', async (t) => {
  const outputFile = 'report.html';
  const outputPath = path.resolve(__dirname, '..', '..', outputFile);

  const [exitCode] = await execute([
    'report',
    '--output',
    outputFile,
    'test/scripts/report.json'
  ]);

  t.ok(exitCode === 0 && deleteFile(outputPath));
});
