#!/usr/bin/env node

const tap = require('tap');
const { $ } = require('zx');

const A9 = process.env.A9 || 'artillery';

const fs = require('fs');
const path = require('path');

// let reportFilePath;
// tap.beforeEach(async (t) => {
//   reportFilePath = returnTmpPath(
//     `report-${createHash('md5')
//       .update(t.name)
//       .digest('hex')}-${Date.now()}.json`
//   );
// });

// async function main() {
// NOTE: This depends on Artillery v2 being installed already

// TODO: Tests with --bundle
// TODO: Test with a real ECS cluster - spin up as needed

//   tap.test('Run simple-bom', async t => {
//     const testRunId = `ci-test-${Date.now()}`;
//     await $`${A9}`;
//     await $`${A9} -V`;

//     const output = await $`${A9} run:fargate ${__dirname}/../manifests/simple-bom/hello.yml --environment boom --region eu-west-1 --count 51`;

//     t.match(output, /summary report/i, 'print summary report');
//     t.match(output, /metrics-by-endpoint/i, 'includes output from metrics-by-endpoint plugin');
//     t.match(output, /p99/i, 'a p99 value is reported');
//     t.match(output, /created:.+510/i, 'expected number of vusers is reported');
//   });

//   tap.test('Run mixed-hierarchy', async t => {
//     const testRunId = `ci-test-${Date.now()}`;
//     const jsonReport = path.join(__dirname, `report-${Date.now()}.json`);
//     const output = await $`${A9} run-test ${__dirname}/../manifests/mixed-hierarchy/scenarios/homepage.yaml --config ${__dirname}/../manifests/mixed-hierarchy/config/config.yaml -e main --output ${jsonReport}`;

//     const report = JSON.parse(fs.readFileSync(jsonReport, 'utf8'));

//     // const testRunData = JSON.parse((await $`${A9} describe-test-run ${testRunId}`).stdout)
//     ;
//     // console.log(testRunData);
//     // TODO:

//     t.equal(report.aggregate.counters['vusers.completed'], 20, 'Should have 20 total VUs');
//     t.equal(report.aggregate.counters['http.codes.200'], 20, 'Should have 20 "200 OK" responses');
//   });

tap.test('Run uses ensure', async (t) => {
  const jsonReport = path.join(__dirname, `report-${Date.now()}.json`);

  try {
    await $`${A9} run:fargate ${__dirname}/fixtures/uses-ensure/main.yaml --output ${jsonReport} --count 5`;
  } catch (output) {
    t.equal(output.exitCode, 1, 'CLI Exit Code should be 1');
    t.ok(output.stdout.includes('fail: http.response_time.p99 < 1'));
    t.ok(output.stdout.includes('ok: p99 < 10000'));

    const report = JSON.parse(fs.readFileSync(jsonReport, 'utf8'));
    t.equal(
      report.aggregate.counters['vusers.completed'],
      100,
      'Should have 300 total VUs'
    );
    t.equal(
      report.aggregate.counters['http.codes.200'],
      100,
      'Should have 300 "200 OK" responses'
    );
  }
});

tap.test(
  'Ensure (with new interface) should still run when workers exit from expect plugin (non zero exit code)',
  async (t) => {
    //Note: this test uses new ensure plugin interface (config.plugins.ensure) to test that indirectly
    const jsonReport = path.join(__dirname, `report-${Date.now()}.json`);

    try {
      await $`${A9} run-test ${__dirname}/fixtures/cli-exit-conditions/with-expect-ensure.yml --output ${jsonReport} --count 2`;
    } catch (output) {
      t.equal(output.exitCode, 1, 'CLI Exit Code should be 1');
      t.ok(output.stdout.includes('fail: http.response_time.p95 < 1'));
      t.ok(output.stdout.includes('ok: p99 < 10000'));

      const report = JSON.parse(fs.readFileSync(jsonReport, 'utf8'));
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
  }
);

//   tap.test('CLI should exit with non-zero exit code when there are failed expectations in workers', async t => {
//     const jsonReport = path.join(__dirname, `report-${Date.now()}.json`);

//     try {
//       await $`${A9} run-test ${__dirname}/../manifests/cli-exit-conditions/with-expect.yml --output ${jsonReport} --count 2`;
//     } catch (output) {
//       t.equal(output.exitCode, 6, 'CLI Exit Code should be 6')

//       const report = JSON.parse(fs.readFileSync(jsonReport, 'utf8'));
//       t.equal(report.aggregate.counters['vusers.completed'], 10, 'Should have 10 total VUs');
//       t.equal(report.aggregate.counters['http.codes.200'], 10, 'Should have 10 "200 OK" responses');
//     }
//   })

//   tap.test('Kitchen Sink Test - multiple features together', async t => {
//     const jsonReport = path.join(__dirname, `report-${Date.now()}.json`);

//     const launchConfig = {
//        environment: [
//         {name: 'SECRET1', value: '/docs'},
//         {name: 'SECRET2', value: '/blog'}
//        ]
//     }

//     const output = await $`${A9} run-test ${__dirname}/../manifests/cli-kitchen-sink/kitchen-sink.yml --output ${jsonReport} --dotenv ${__dirname}/../manifests/cli-kitchen-sink/kitchen-sink-env --count 2 --launch-config ${JSON.stringify(launchConfig)}`;

//     t.equal(output.exitCode, 0, 'CLI Exit Code should be 0')
//     t.ok(output.stdout.includes('ok: http.response_time.p99 < 10000'))
//     t.ok(output.stdout.includes('ok: p99 < 10000'))

//     const report = JSON.parse(fs.readFileSync(jsonReport, 'utf8'));
//     t.equal(report.aggregate.counters['vusers.completed'], 40, 'Should have 40 total VUs');
//     t.equal(report.aggregate.counters['http.codes.200'], 160, 'Should have 160 "200 OK" responses');
//   })

//   tap.test('Smoke test - list-tests', async t => {
//     await $`${A9} list-tests`;
//     t.ok('Can run list-tests');
//   });
// }

// main();
