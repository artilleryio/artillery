const tap = require('tap');
const { a9 } = require('../cli/_helpers.js');
const path = require('path');


tap.test('Run a test on AWS Lambda', async (t) => {
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
    '--platform-opt',
    'memory-size=3000',
    '--platform-opt',
    'region=eu-west-1',
    '--config',
    configPath,
    scenarioPath
  ]);

  t.ok(
    stdout.indexOf('Summary report') > 0 && stdout.indexOf('http.codes.200') > 0
  );
});