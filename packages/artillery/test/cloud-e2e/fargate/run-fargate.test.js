const { test, before } = require('tap');
const { $ } = require('zx');

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
