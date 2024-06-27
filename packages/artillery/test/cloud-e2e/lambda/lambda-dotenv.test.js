const tap = require('tap');
const fs = require('fs');
const { $ } = require('zx');
const {
  getTestTags,
  generateTmpReportPath,
  getImageArchitecture
} = require('../../helpers');

const tags = getTestTags(['type:acceptance']);
const A9_PATH = process.env.A9_PATH || 'artillery';
const ARCHITECTURE = getImageArchitecture();

tap.before(async () => {
  await $`${A9_PATH} -V`;
});

let reportFilePath;
tap.beforeEach(async (t) => {
  process.env.RETAIN_LAMBDA = 'false';
  reportFilePath = generateTmpReportPath(t.name, 'json');
});

tap.test('Run dotenv test in Lambda Container', async (t) => {
  const scenarioPath = `${__dirname}/fixtures/dotenv/dotenv-test.yml`;
  const dotenvPath = `${__dirname}/fixtures/dotenv/.env-test`;

  const output =
    await $`${A9_PATH} run-lambda ${scenarioPath} --architecture ${ARCHITECTURE} --tags ${tags} --dotenv ${dotenvPath} --output ${reportFilePath} --count 5 --record`;

  const report = JSON.parse(fs.readFileSync(reportFilePath, 'utf8'));

  t.equal(output.exitCode, 0, 'CLI Exit Code should be 0');

  t.equal(
    report.aggregate.counters['vusers.created'],
    50,
    'Should have 50 vusers created'
  );

  t.equal(
    report.aggregate.counters['fruit.dragonfruit'],
    50,
    'Should have custom counter for env variable fruit'
  );
});
