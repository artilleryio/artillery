const tap = require('node:test');
const assert = require('node:assert');
const { execute, generateTmpReportPath, deleteFile } = require('../helpers');
const { checkForNegativeValues } = require('../helpers/expectations');
const fs = require('node:fs');
const path = require('node:path');

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

  assert.strictEqual(exitCode, 0, 'CLI should exit with code 0');
  assert.ok(output.stdout.includes('Got context using lodash: true'), 'Should be able to use lodash in a scenario to get context');
  const json = JSON.parse(fs.readFileSync(reportFilePath, 'utf8'));

  assert.strictEqual(json.aggregate.counters['http.codes.200'], 2, 'Should have made 2 requests');
  assert.strictEqual(json.aggregate.counters.hey_from_ts, 2, 'Should have emitted 2 custom metrics from ts processor');

  checkForNegativeValues(t, json);
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
  assert.strictEqual(exitCode, 0, 'CLI should exit with code 0');
  assert.ok(output.stdout.includes('Got context using lodash: true'), 'Should be able to use lodash in a scenario to get context');
  const json = JSON.parse(fs.readFileSync(reportFilePath, 'utf8'));

  assert.strictEqual(json.aggregate.counters['http.codes.200'], 2, 'Should have made 2 requests');
  assert.strictEqual(json.aggregate.counters.hey_from_ts, 2, 'Should have emitted 2 custom metrics from ts processor');
  checkForNegativeValues(t, json);

  //assert that the bundle was created and marked as external
  const bundleLocation = path.join(
    path.dirname('test/scripts/scenarios-typescript/lodash.yml'),
    'dist/processor.js'
  );
  assert.ok(fs.existsSync(bundleLocation), 'Bundle should exist');
  const bundle = fs.readFileSync(bundleLocation, 'utf8');
  assert.ok(bundle.includes('require("lodash")'), 'Bundle should require lodash instead of bundling it');

  await deleteFile(bundleLocation);
});
