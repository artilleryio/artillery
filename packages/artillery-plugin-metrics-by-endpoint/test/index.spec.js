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

test('Reports correctly when `groupDynamicURLs` is set to true (default)', async (t) => {
  const reportPath =
    os.tmpdir() + '/artillery-plugin-metrics-by-endpoint-use-path-as-name.json';
  const output =
    await $`../artillery/bin/run run ./test/fixtures/scenario-templated-url.yml -o ${reportPath}`;

  const report = require(reportPath);

  t.equal(output.exitCode, 0, 'CLI Exit Code should be 0');
  t.equal(
    report.aggregate.counters[
      'plugins.metrics-by-endpoint./armadillo/{{ $randomString() }}.codes.200'
    ],
    4,
    'should have counter metrics including templated url and no query strings'
  );
  t.equal(
    report.aggregate.counters[
      'plugins.metrics-by-endpoint./dino/{{ $randomString() }} (GET /dino).codes.200'
    ],
    4,
    'should have counter metrics including templated url with request name specified'
  );
  t.equal(
    report.aggregate.counters['plugins.metrics-by-endpoint./pony.codes.200'],
    4
  ),
    'should display counter metrics for /pony as normal';

  t.ok(
    Object.keys(report.aggregate.summaries).includes(
      'plugins.metrics-by-endpoint.response_time./armadillo/{{ $randomString() }}'
    ),
    'should have summary metrics including templated url'
  );
  t.ok(
    Object.keys(report.aggregate.summaries).includes(
      'plugins.metrics-by-endpoint.response_time./dino/{{ $randomString() }} (GET /dino)'
    ),
    'should have summary metrics including templated url with request name specified'
  );
  t.ok(
    Object.keys(report.aggregate.summaries).includes(
      'plugins.metrics-by-endpoint.response_time./pony'
    ),
    'should display summary metrics for /pony as normal'
  );
});

test('Reports correctly when `groupDynamicURLs` is explicitly set to false', async (t) => {
  const reportPath =
    os.tmpdir() +
    '/artillery-plugin-metrics-by-endpoint-use-path-without-name-test.json';
  const overrides = {
    config: {
      plugins: {
        'metrics-by-endpoint': {
          groupDynamicURLs: false,
          stripQueryString: false
        }
      }
    }
  };
  const output =
    await $`../artillery/bin/run run ./test/fixtures/scenario-templated-url.yml -o ${reportPath} --overrides ${JSON.stringify(
      overrides
    )}`;

  const report = require(reportPath);

  t.equal(output.exitCode, 0, 'CLI Exit Code should be 0');

  const aggregateCounters = Object.keys(report.aggregate.counters);

  const countersWithName = aggregateCounters.filter((counter) => {
    return new RegExp(
      /plugins\.metrics-by-endpoint\.\/dino\/[a-zA-Z0-9]+\.?\w+\?potato=1&tomato=2 \(GET \/dino\)\.codes\.200/
    ).test(counter);
  });

  const countersWithoutName = aggregateCounters.filter((counter) => {
    return new RegExp(
      /plugins\.metrics-by-endpoint\.\/armadillo\/[a-zA-Z0-9]+\.?\w+\.codes\.200/
    ).test(counter);
  });

  const regularPonyCounter = aggregateCounters.filter(
    (counter) => counter == 'plugins.metrics-by-endpoint./pony.codes.200'
  );

  t.ok(
    countersWithName.length > 0,
    `should have counter metrics without the templated url, got ${countersWithName}`
  );
  t.ok(
    countersWithoutName.length > 0,
    `should have counter metrics without the templated url and request name specified, got ${countersWithoutName}`
  );
  t.ok(
    regularPonyCounter.length == 1,
    `should display counter metrics for /pony as normal, got ${regularPonyCounter}`
  );
});
