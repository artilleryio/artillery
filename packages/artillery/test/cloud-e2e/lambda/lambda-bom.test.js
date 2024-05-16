const tap = require('tap');
const fs = require('fs');
const { $ } = require('zx');
const { getTestTags, generateTmpReportPath } = require('../../cli/_helpers.js');

const tags = getTestTags(['type:acceptance']);

let reportFilePath;
tap.beforeEach(async (t) => {
  process.env.LAMBDA_IMAGE_VERSION = process.env.ECR_IMAGE_VERSION;
  process.env.RETAIN_LAMBDA = 'false';
  reportFilePath = generateTmpReportPath(t.name, 'json');
});

tap.test('Run mixed-hierarchy test in Lambda Container', async (t) => {
  const scenarioPath = `${__dirname}/../fargate/fixtures/mixed-hierarchy/scenarios/mixed-hierarchy-dino.yml`;
  const configPath = `${__dirname}/../fargate/fixtures/mixed-hierarchy/config/config-no-file-uploads.yml`;

  const output =
    await $`artillery run-lambda ${scenarioPath} --config ${configPath} -e main --tags ${tags} --output ${reportFilePath} --record --container`;

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
});
