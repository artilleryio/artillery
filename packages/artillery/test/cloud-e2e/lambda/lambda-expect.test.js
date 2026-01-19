const tap = require('tap');
const { $ } = require('zx');
const _chalk = require('chalk');
const fs = require('node:fs');
const {
  generateTmpReportPath,
  getTestTags,
  getImageArchitecture
} = require('../../helpers');
const {
  checkForNegativeValues,
  checkAggregateCounterSums
} = require('../../helpers/expectations');

const tags = getTestTags(['type:acceptance']);
let reportFilePath;
tap.beforeEach(async (t) => {
  process.env.RETAIN_LAMBDA = 'false';
  reportFilePath = generateTmpReportPath(t.name, 'json');
});

const A9_PATH = process.env.A9_PATH || 'artillery';
const ARCHITECTURE = getImageArchitecture();

tap.before(async () => {
  await $`${A9_PATH} -V`;
});

tap.test(
  'CLI should exit with non-zero exit code when there are failed expectations in container workers',
  async (t) => {
    try {
      await $`${A9_PATH} run-lambda ${__dirname}/../fargate/fixtures/cli-exit-conditions/with-expect.yml --architecture ${ARCHITECTURE} --record --tags ${tags} --output ${reportFilePath} --count 2`;
      t.fail(`Test "${t.name}" - Should have had non-zero exit code.`);
    } catch (output) {
      t.equal(output.exitCode, 21, 'CLI Exit Code should be 21');
      t.ok(
        !output.stderr.includes('Worker exited with an error'),
        'Should not have worker exit error message in stdout'
      );

      const report = JSON.parse(fs.readFileSync(reportFilePath, 'utf8'));
      t.equal(
        report.aggregate.counters['vusers.completed'],
        10,
        'Should have 10 total VUs'
      );

      t.equal(
        report.aggregate.counters['plugins.expect.failed'],
        10,
        'Should have 20 failed expectations'
      );

      t.equal(
        report.aggregate.counters['http.codes.200'],
        10,
        'Should have 10 "200 OK" responses'
      );

      checkForNegativeValues(t, report);
      checkAggregateCounterSums(t, report);
    }
  }
);
