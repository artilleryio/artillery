const { test } = require('tap');
const { $ } = require('zx');
const os = require('os');

test('reports in console and json report correctly', async (t) => {
  const reportPath =
    os.tmpdir() + '/artillery-plugin-metrics-by-endpoint-test.json';
  const output =
    await $`../artillery/bin/run run ./test/fixtures/scenario.yml -o ${reportPath}`;

  // Assert console output includes plugin metrics
  t.ok(output.stdout.includes('plugins.metrics-by-endpoint./dino.codes.200:'));
  t.ok(output.stdout.includes('plugins.metrics-by-endpoint./pony.codes.200:'));
  t.ok(
    output.stdout.includes('plugins.metrics-by-endpoint.response_time./dino')
  );
  t.ok(
    output.stdout.includes('plugins.metrics-by-endpoint.response_time./pony')
  );

  //Assert json report includes plugin metrics
  const jsonReport = require(reportPath);

  t.equal(
    jsonReport.aggregate.counters[
      'plugins.metrics-by-endpoint./dino.codes.200'
    ],
    4
  );
  t.equal(
    jsonReport.aggregate.counters[
      'plugins.metrics-by-endpoint./pony.codes.200'
    ],
    4
  );
  t.ok(
    Object.keys(jsonReport.aggregate.summaries).includes(
      'plugins.metrics-by-endpoint.response_time./dino'
    )
  );
  t.ok(
    Object.keys(jsonReport.aggregate.summaries).includes(
      'plugins.metrics-by-endpoint.response_time./pony'
    )
  );
});

test("Reports correctly when 'parallel' is used", async (t) => {
  const expectedVus = 4;
  const expectedVusFailed = 0;
  const requestPaths = ['/dino', '/pony', '/armadillo'];

  const reportPath =
    os.tmpdir() + '/artillery-plugin-metrics-by-endpoint-parallel-test.json';
  const output =
    await $`../artillery/bin/run run ./test/fixtures/scenario-parallel.yml -o ${reportPath}`;

  const report = require(reportPath);

  t.equal(output.exitCode, 0, 'CLI Exit Code should be 0');
  t.equal(
    report.aggregate.counters['vusers.created'],
    expectedVus,
    `${expectedVus} VUs should have been created`
  );
  t.equal(
    report.aggregate.counters['vusers.failed'],
    expectedVusFailed,
    `${expectedVusFailed} VUs should have failed`
  );
  for (const path of requestPaths) {
    t.equal(
      report.aggregate.counters[
        `plugins.metrics-by-endpoint.${path}.codes.200`
      ],
      expectedVus,
      `${expectedVus} requests to ${path} should have returned 200`
    );
  }
});
