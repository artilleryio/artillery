const { test, before } = require('node:test');
const assert = require('node:assert');
const { $ } = require('zx');
const { getTestTags } = require('../../helpers');

const A9_PATH = process.env.A9_PATH || 'artillery';

before(async () => {
  await $`${A9_PATH} -V`;
});

//NOTE: all these tests report to Artillery Dashboard to dogfood and improve visibility
const baseTags = getTestTags(['type:acceptance']);

test('Fargate should exit with error code when workers run out of memory', async (t) => {
  try {
    await $`${A9_PATH} run-fargate ${__dirname}/fixtures/memory-hog/memory-hog.yml --record --tags ${baseTags},should_fail:true --region us-east-1`;
    assert.fail(`Test "${t.name}" - Should have had non-zero exit code.`);
  } catch (output) {
    assert.strictEqual(output.exitCode, 6, 'CLI Exit Code should be 6');

    assert.match(output.stdout, /summary report/i, 'print summary report');
    assert.match(output.stdout, /p99/i, 'a p99 value is reported');
  }
});

test('Fargate should not run out of memory when cpu and memory is increased via launch config', async (_t) => {
  const output =
    await $`${A9_PATH} run-fargate ${__dirname}/fixtures/memory-hog/memory-hog.yml --record --tags ${baseTags},should_fail:false --region us-east-1 --launch-config '{"cpu":"8192", "memory":"20480"}'`;

  assert.strictEqual(output.exitCode, 0, 'CLI Exit Code should be 0');
  assert.match(output.stdout, /summary report/i, 'print summary report');
  assert.match(output.stdout, /p99/i, 'a p99 value is reported');
});

test('Fargate should not run out of memory when cpu and memory is increased via flags', async (_t) => {
  const output =
    await $`${A9_PATH} run-fargate ${__dirname}/fixtures/memory-hog/memory-hog.yml --record --tags ${baseTags},should_fail:false --region us-east-1 --cpu 8 --memory 20`;

  assert.strictEqual(output.exitCode, 0, 'CLI Exit Code should be 0');
  assert.match(output.stdout, /summary report/i, 'print summary report');
  assert.match(output.stdout, /p99/i, 'a p99 value is reported');
});
