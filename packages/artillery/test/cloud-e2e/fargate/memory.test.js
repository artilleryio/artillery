const { test, before, beforeEach } = require('tap');
const { $ } = require('zx');
const { generateTmpReportPath, getTestTags } = require('../../cli/_helpers.js');

const A9 = process.env.A9 || 'artillery';

before(async () => {
  await $`${A9} -V`;
});

//NOTE: all these tests report to Artillery Dashboard to dogfood and improve visibility
const baseTags = getTestTags(['type:acceptance']);

test('Fargate should exit with error code when workers run out of memory', async (t) => {
  try {
    await $`${A9} run-fargate ${__dirname}/fixtures/memory-hog/memory-hog.yml --record --tags ${baseTags},should_fail:true --region us-east-1`;
    t.fail(`Test "${t.name}" - Should have had non-zero exit code.`);
  } catch (output) {
    t.equal(output.exitCode, 6, 'CLI Exit Code should be 6');

    t.match(output, /summary report/i, 'print summary report');
    t.match(output, /p99/i, 'a p99 value is reported');
  }
});

test('Fargate should not run out of memory when cpu and memory is increased via launch config', async (t) => {
  const output =
    await $`${A9} run-fargate ${__dirname}/fixtures/memory-hog/memory-hog.yml --record --tags ${baseTags},should_fail:false --region us-east-1 --launch-config '{"cpu":"4096", "memory":"12288"}'`;

  t.equal(output.exitCode, 0, 'CLI Exit Code should be 0');
  t.match(output, /summary report/i, 'print summary report');
  t.match(output, /p99/i, 'a p99 value is reported');
});

test('Fargate should not run out of memory when cpu and memory is increased via flags', async (t) => {
  const output =
    await $`${A9} run-fargate ${__dirname}/fixtures/memory-hog/memory-hog.yml --record --tags ${baseTags},should_fail:false --region us-east-1 --cpu 4 --memory 12`;

  t.equal(output.exitCode, 0, 'CLI Exit Code should be 0');
  t.match(output, /summary report/i, 'print summary report');
  t.match(output, /p99/i, 'a p99 value is reported');
});
