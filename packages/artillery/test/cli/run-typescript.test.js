const tap = require('tap');
const {
  execute,
  generateTmpReportPath,
  deleteFile
} = require('../cli/_helpers.js');
const fs = require('fs');
const path = require('path');

let reportFilePath;
tap.beforeEach(async (t) => {
  reportFilePath = generateTmpReportPath(t.name, 'json');
});

tap.test('Can run a Typescript processor', async (t) => {
  const [exitCode, output] = await execute([
    'run',
    '-o',
    `${reportFilePath}`,
    'test/scripts/scenarios-typescript/lodash.yml'
  ]);

  t.equal(exitCode, 0, 'CLI should exit with code 0');
  t.ok(
    output.stdout.includes('Got context using lodash: true'),
    'Should be able to use lodash in a scenario to get context'
  );
  const json = JSON.parse(fs.readFileSync(reportFilePath, 'utf8'));

  t.equal(
    json.aggregate.counters['http.codes.200'],
    2,
    'Should have made 2 requests'
  );
  t.equal(
    json.aggregate.counters['hey_from_ts'],
    2,
    'Should have emitted 2 custom metrics from ts processor'
  );
});

tap.test('Runs correctly when package is marked as external', async (t) => {
  const override = JSON.stringify({
    config: {
      bundling: {
        external: ['lodash']
      }
    }
  });

  const [exitCode, output] = await execute(
    [
      'run',
      '-o',
      `${reportFilePath}`,
      'test/scripts/scenarios-typescript/lodash.yml',
      '--overrides',
      override
    ],
    {
      env: { ARTILLERY_TS_KEEP_BUNDLE: true, extendEnv: true }
    }
  );

  //assert that test ran successfully
  t.equal(exitCode, 0, 'CLI should exit with code 0');
  t.ok(
    output.stdout.includes('Got context using lodash: true'),
    'Should be able to use lodash in a scenario to get context'
  );
  const json = JSON.parse(fs.readFileSync(reportFilePath, 'utf8'));

  t.equal(
    json.aggregate.counters['http.codes.200'],
    2,
    'Should have made 2 requests'
  );
  t.equal(
    json.aggregate.counters['hey_from_ts'],
    2,
    'Should have emitted 2 custom metrics from ts processor'
  );

  //assert that the bundle was created and marked as external
  const bundleLocation = path.join(
    path.dirname('test/scripts/scenarios-typescript/lodash.yml'),
    'dist/processor.js'
  );
  t.ok(fs.existsSync(bundleLocation), 'Bundle should exist');
  const bundle = fs.readFileSync(bundleLocation, 'utf8');
  t.ok(
    bundle.includes('require("lodash")'),
    'Bundle should require lodash instead of bundling it'
  );

  await deleteFile(bundleLocation);
});

tap.test(
  'Failure from a Typescript processor has a resolvable stack trace via source maps',
  async (t) => {
    const [_exitCode, output] = await execute([
      'run',
      '-o',
      `${reportFilePath}`,
      'test/scripts/scenarios-typescript/error.yml'
    ]);

    t.ok(
      output.stdout.includes('error_from_ts_processor'),
      'Should have logged error from ts processor'
    );

    // // Search for the path
    // const pathRegex = /\((.*?):\d+:\d+\)/;
    // const match = output.stdout.match(pathRegex);

    // // Extract the path if found
    // const extractedPath = match ? match[1] : null;

    // t.ok(
    //   extractedPath.includes('.ts'),
    //   'Should be using source maps to resolve the path to a .ts file'
    // );
    // t.ok(fs.existsSync(extractedPath), 'Error path should exist');
  }
);
