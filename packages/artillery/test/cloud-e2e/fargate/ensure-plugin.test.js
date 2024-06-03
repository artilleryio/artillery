const { test, before, beforeEach } = require('tap');
const { $ } = require('zx');
const chalk = require('chalk');
const fs = require('fs');
const { generateTmpReportPath, getTestTags } = require('../../cli/_helpers.js');

const A9_PATH = process.env.A9_PATH || 'artillery';

before(async () => {
  await $`${A9_PATH} -V`;
});

//NOTE: all these tests report to Artillery Dashboard to dogfood and improve visibility
const baseTags = getTestTags(['type:acceptance']);
let reportFilePath;
beforeEach(async (t) => {
  reportFilePath = generateTmpReportPath(t.name, 'json');
});

test('Run uses ensure', async (t) => {
  try {
    await $`${A9_PATH} run:fargate ${__dirname}/fixtures/uses-ensure/with-ensure.yaml --record --tags ${baseTags} --output ${reportFilePath} --count 15`;
    t.fail(`Test "${t.name}" - Should have had non-zero exit code.`);
  } catch (output) {
    t.equal(output.exitCode, 1, 'CLI Exit Code should be 1');
    t.ok(
      output.stdout.includes(`${chalk.red('fail')}: http.response_time.p99 < 1`)
    );
    t.ok(output.stdout.includes(`${chalk.green('ok')}: p99 < 10000`));

    const report = JSON.parse(fs.readFileSync(reportFilePath, 'utf8'));
    t.equal(
      report.aggregate.counters['vusers.completed'],
      300,
      'Should have 300 total VUs'
    );
    t.equal(
      report.aggregate.counters['http.codes.200'],
      300,
      'Should have 300 "200 OK" responses'
    );
  }
});
