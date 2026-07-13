const tap = require('node:test');
const assert = require('node:assert');
const { execute, generateTmpReportPath } = require('../helpers');

tap.test('If we report specifying output, no browser is opened', async (t) => {
  const outputFilePath = generateTmpReportPath(t.name, 'html');

  const [exitCode] = await execute([
    'report',
    '--output',
    outputFilePath,
    'test/scripts/report.json'
  ]);

  assert.strictEqual(exitCode, 0, 'CLI should exit with code 0');
});
