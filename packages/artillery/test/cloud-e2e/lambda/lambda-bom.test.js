const tap = require('tap');
const fs = require('fs');
const { $ } = require('zx');
const {
  getTestTags,
  generateTmpReportPath,
  getImageArchitecture
} = require('../../helpers');
const {
  checkForNegativeValues,
  checkAggregateCounterSums
} = require('../../helpers/expectations');

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

tap.test('Run simple-bom', async (t) => {
  const scenarioPath = `${__dirname}/../fargate/fixtures/simple-bom/simple-bom.yml`;

  const output =
    await $`${A9_PATH} run-lambda ${scenarioPath} --architecture ${ARCHITECTURE} -e test --tags ${tags} --output ${reportFilePath} --count 51 --record`;

  t.equal(output.exitCode, 0, 'CLI Exit Code should be 0');

  t.match(output.stdout, /summary report/i, 'print summary report');
  t.match(output.stdout, /p99/i, 'a p99 value is reported');
  t.match(
    output.stdout,
    /created:.+510/i,
    'expected number of vusers is reported'
  );
});

tap.test('Run mixed-hierarchy test in Lambda Container', async (t) => {
  const scenarioPath = `${__dirname}/../fargate/fixtures/mixed-hierarchy/scenarios/mixed-hierarchy-dino.yml`;
  const configPath = `${__dirname}/../fargate/fixtures/mixed-hierarchy/config/config-no-file-uploads.yml`;

  const output =
    await $`${A9_PATH} run-lambda ${scenarioPath} --architecture ${ARCHITECTURE} --config ${configPath} -e main --tags ${tags} --output ${reportFilePath} --record`;

  const report = JSON.parse(fs.readFileSync(reportFilePath, 'utf8'));

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

  checkForNegativeValues(t, report);
  checkAggregateCounterSums(t, report);
});
