const tap = require('node:test');
const assert = require('node:assert');
const { $ } = require('zx');
const chalk = require('chalk');
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

//NOTE: all these tests report to Artillery Dashboard to dogfood and improve visibility
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

tap.test('Lambda Container run uses ensure', async (t) => {
  try {
    await $`${A9_PATH} run-lambda ${__dirname}/../fargate/fixtures/uses-ensure/with-ensure.yaml --architecture ${ARCHITECTURE} --tags ${tags} --output ${reportFilePath} --count 15`;
    assert.fail(`Test "${t.name}" - Should have had non-zero exit code.`);
  } catch (output) {
    assert.strictEqual(output.exitCode, 1, 'CLI Exit Code should be 1');
    assert.ok(output.stdout.includes(`${chalk.red('fail')}: http.response_time.p99 < 1`));
    assert.ok(output.stdout.includes(`${chalk.green('ok')}: p99 < 10000`));

    const report = JSON.parse(fs.readFileSync(reportFilePath, 'utf8'));
    assert.strictEqual(report.aggregate.counters['vusers.completed'], 300, 'Should have 300 total VUs');
    assert.strictEqual(report.aggregate.counters['http.codes.200'], 300, 'Should have 300 "200 OK" responses');

    checkForNegativeValues(t, report);
    checkAggregateCounterSums(t, report);
  }
});
