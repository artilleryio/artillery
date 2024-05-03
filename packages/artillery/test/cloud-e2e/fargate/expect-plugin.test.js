const { test, before, beforeEach } = require('tap');
const { $ } = require('zx');
const chalk = require('chalk');
const fs = require('fs');
const { generateTmpReportPath, getTestTags } = require('../../cli/_helpers.js');

const A9 = process.env.A9 || 'artillery';

before(async () => {
  await $`${A9} -V`;
});

//NOTE: all these tests report to Artillery Dashboard to dogfood and improve visibility
const baseTags = getTestTags(['type:acceptance']);
let reportFilePath;
beforeEach(async (t) => {
  reportFilePath = generateTmpReportPath(t.name, 'json');
});

test('CLI should exit with non-zero exit code when there are failed expectations in workers', async (t) => {
  try {
    await $`${A9} run-fargate ${__dirname}/fixtures/cli-exit-conditions/with-expect.yml --record --tags ${baseTags} --output ${reportFilePath} --count 2`;
    t.fail(`Test "${t.name}" - Should have had non-zero exit code.`);
  } catch (output) {
    t.equal(output.exitCode, 6, 'CLI Exit Code should be 6');

    const report = JSON.parse(fs.readFileSync(reportFilePath, 'utf8'));
    t.equal(
      report.aggregate.counters['vusers.completed'],
      10,
      'Should have 10 total VUs'
    );
    t.equal(
      report.aggregate.counters['http.codes.200'],
      10,
      'Should have 10 "200 OK" responses'
    );
  }
});

test('Ensure (with new interface) should still run when workers exit from expect plugin (non zero exit code)', async (t) => {
  //Note: this test uses new ensure plugin interface (config.plugins.ensure) to test that indirectly

  try {
    await $`${A9} run:fargate ${__dirname}/fixtures/cli-exit-conditions/with-expect-ensure.yml --record --tags ${baseTags} --output ${reportFilePath} --count 2`;
    t.fail(`Test "${t.name}" - Should have had non-zero exit code.`);
  } catch (output) {
    t.equal(output.exitCode, 1, 'CLI Exit Code should be 1');
    t.ok(
      output.stdout.includes(`${chalk.red('fail')}: http.response_time.p95 < 1`)
    );
    t.ok(output.stdout.includes(`${chalk.green('ok')}: p99 < 10000`));

    const report = JSON.parse(fs.readFileSync(reportFilePath, 'utf8'));
    t.equal(
      report.aggregate.counters['vusers.completed'],
      10,
      'Should have 10 total VUs'
    );
    t.equal(
      report.aggregate.counters['http.codes.200'],
      10,
      'Should have 10 "200 OK" responses'
    );
  }
});
