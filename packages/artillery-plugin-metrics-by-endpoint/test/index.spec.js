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
