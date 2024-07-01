const tap = require('tap');
const { execute, generateTmpReportPath } = require('../helpers');
const { checkForNegativeValues } = require('../helpers/expectations');
const fs = require('fs');

let reportFilePath;
tap.beforeEach(async (t) => {
  reportFilePath = generateTmpReportPath(t.name, 'json');
});

tap.test('async hooks with ESM', async (t) => {
  const [exitCode, output] = await execute([
    'run',
    '-o',
    `${reportFilePath}`,
    'test/scripts/scenario-async-esm-hooks/test.yml'
  ]);

  t.equal(exitCode, 0, 'CLI should exit with code 0');
  t.ok(
    output.stdout.includes('Got context using lodash: true'),
    'Should be able to use lodash in a scenario to get context'
  );
  const json = JSON.parse(fs.readFileSync(reportFilePath, 'utf8'));

  t.equal(
    json.aggregate.counters['http.codes.200'],
    10,
    'Should have made 10 requests'
  );

  t.equal(
    json.aggregate.counters['hey_from_esm'],
    10,
    'Should have emitted 10 custom metrics from ts processor'
  );

  t.equal(
    json.aggregate.counters['errors.error_from_async_hook'],
    10,
    'Should have emitted 10 errors from an exception in an async hook'
  );

  t.equal(
    json.aggregate.counters['vusers.failed'],
    10,
    'Should have no completed VUs'
  );

  checkForNegativeValues(t, json);
});
