const tap = require('tap');
const fs = require('fs');
const { $ } = require('zx');
const { getTestTags, generateTmpReportPath, execute } = require('../../cli/_helpers.js');
const path = require('path');

const tags = getTestTags(['type:acceptance']);

let reportFilePath;
tap.beforeEach(async (t) => {
  process.env.LAMBDA_IMAGE_VERSION = process.env.ECR_IMAGE_VERSION;
  process.env.RETAIN_LAMBDA = 'false';
  reportFilePath = generateTmpReportPath(t.name, 'json');
});



tap.test('Run simple-bom', async (t) => {
  // const scenarioPath = `${__dirname}/../fargate/fixtures/simple-bom/simple-bom.yml`;

  const scenarioPath = path.join(__dirname, '../fargate/fixtures/simple-bom/simple-bom.yml');
  const [exitCode, output] = await execute([
    'run-fargate',
    '--environment',
    'test',
    '--count',
    '51',
    '--tags',
    tags,
    '--record',
    '--container',
    scenarioPath
  ]);

  console.log(output)

  t.equal(exitCode, 0, 'CLI Exit Code should be 0');

  t.match(output.stdout, /summary report/i, 'print summary report');
  t.match(output.stdout, /p99/i, 'a p99 value is reported');
  t.match(
    output.stdout,
    /created:.+510/i,
    'expected number of vusers is reported'
  );
});

// tap.test('Run simple-bom', async (t) => {
//   // const scenarioPath = `${__dirname}/../fargate/fixtures/simple-bom/simple-bom.yml`;
//   const scenarioPath = path.join(__dirname, '../fargate/fixtures/simple-bom/simple-bom.yml');

//   const output =
//     await $`artillery run-lambda ${scenarioPath} -e test --tags ${tags} --output ${reportFilePath} --count 51 --record --container`;

//   t.equal(output.exitCode, 0, 'CLI Exit Code should be 0');

//   t.match(output.stdout, /summary report/i, 'print summary report');
//   t.match(output.stdout, /p99/i, 'a p99 value is reported');
//   t.match(
//     output.stdout,
//     /created:.+510/i,
//     'expected number of vusers is reported'
//   );
// });

// tap.test('Run mixed-hierarchy test in Lambda Container', async (t) => {
//   const scenarioPath = `${__dirname}/../fargate/fixtures/mixed-hierarchy/scenarios/mixed-hierarchy-dino.yml`;
//   const configPath = `${__dirname}/../fargate/fixtures/mixed-hierarchy/config/config-no-file-uploads.yml`;

//   const output =
//     await $`artillery run-lambda ${scenarioPath} --config ${configPath} -e main --tags ${tags} --output ${reportFilePath} --record --container`;

//   const report = JSON.parse(fs.readFileSync(reportFilePath, 'utf8'));

//   t.equal(output.exitCode, 0, 'CLI Exit Code should be 0');

//   t.equal(
//     report.aggregate.counters['vusers.completed'],
//     20,
//     'Should have 20 total VUs'
//   );
//   t.equal(
//     report.aggregate.counters['http.codes.200'],
//     20,
//     'Should have 20 "200 OK" responses'
//   );
// });
