const { test, before } = require('tap');
const { $ } = require('zx');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const A9 = process.env.A9 || 'artillery';

before(async () => {
  await $`${A9} -V`;
});

test('Run simple-bom', async (t) => {
  const output =
    await $`${A9} run-fargate ${__dirname}/fixtures/simple-bom/test.yml --environment test --region eu-west-1 --count 10`;

  t.equal(output.exitCode, 0, 'CLI Exit Code should be 0');

  t.match(output, /summary report/i, 'print summary report');
  t.match(output, /p99/i, 'a p99 value is reported');
  t.match(output, /created:.+100/i, 'expected number of vusers is reported');
});

test('Run mixed-hierarchy', async (t) => {
  const jsonReport = path.join(__dirname, `report-${Date.now()}.json`);
  const output =
    await $`${A9} run-fargate ${__dirname}/fixtures/mixed-hierarchy/scenarios/dino.yml --config ${__dirname}/fixtures/mixed-hierarchy/config/config.yml -e main --output ${jsonReport}`;

  const report = JSON.parse(fs.readFileSync(jsonReport, 'utf8'));

  t.equal(output.exitCode, 0, 'CLI Exit Code should be 0');

  t.equal(
    report.aggregate.counters['vusers.completed'],
    20,
    'Should have 20 total VUs'
  );
  t.equal(
    report.aggregate.counters['http.codes.200'],
    20,
    'Should have 20 "200 OK" responses'
  );
});

test('Run uses ensure', async (t) => {
  const jsonReport = path.join(__dirname, `report-${Date.now()}.json`);

  try {
    await $`${A9} run:fargate ${__dirname}/fixtures/uses-ensure/test.yaml --output ${jsonReport} --count 15`;
  } catch (output) {
    t.equal(output.exitCode, 1, 'CLI Exit Code should be 1');
    t.ok(
      output.stdout.includes(`${chalk.red('fail')}: http.response_time.p99 < 1`)
    );
    t.ok(output.stdout.includes(`${chalk.green('ok')}: p99 < 10000`));

    const report = JSON.parse(fs.readFileSync(jsonReport, 'utf8'));
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
