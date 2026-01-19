const tap = require('tap');
const { execute, generateTmpReportPath } = require('../helpers');

tap.test('If we report specifying output, no browser is opened', async (t) => {
  const outputFilePath = generateTmpReportPath(t.name, 'html');

  const [exitCode] = await execute([
    'report',
    '--output',
    outputFilePath,
    'test/scripts/report.json'
  ]);

  t.equal(exitCode, 0, 'CLI should exit with code 0');
});
