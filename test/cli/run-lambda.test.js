const tap = require('tap');
const { a9 } = require('./_helpers.js');
const path = require('path');

tap.test('Run a test on AWS Lambda', async (t) => {
  t.setTimeout(300 * 1000);

  const configPath = path.resolve(
    __dirname,
    '..',
    'scripts',
    'blitz',
    'config.yml'
  );

  const scenarioPath = path.resolve(
    __dirname,
    '..',
    'scripts',
    'blitz',
    'scenarios',
    'blitz.yml'
  );
  const { stdout } = await a9([
    'run',
    '--platform',
    'aws:lambda',
    '--count',
    '10',
    '--config',
    configPath,
    scenarioPath
  ]);

  t.ok(stdout.indexOf('Summary report') > 0);
});