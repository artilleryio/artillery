const { test, afterEach, beforeEach, before } = require('tap');
const { $ } = require('zx');
const { getTestTags } = require('../../artillery/test/helpers');
const fs = require('node:fs');

const TEST_URL = 'https://www.artillery.io/';
const tags = getTestTags(['typescript:true']);
let playwrightOutput;

beforeEach(() => {
  playwrightOutput = `${process.cwd()}/pw_acceptance_${Date.now()}.json`;
});

afterEach(async () => {
  fs.unlinkSync(playwrightOutput);
});

const A9_PATH = process.env.A9_PATH || '../artillery/bin/run';
before(async () => {
  await $`${A9_PATH} -V`;
});

test('playwright typescript test works and reports data', async (t) => {
  const output =
    await $`${A9_PATH} run:fargate ./test/fixtures/pw-acceptance-ts.yml --output ${playwrightOutput} --tags ${tags} --record`;

  t.equal(
    output.exitCode,
    0,
    `should have exit code 0, got ${output.exitCode}`
  );

  const jsonReportAggregate = JSON.parse(
    fs.readFileSync(playwrightOutput, 'utf8')
  ).aggregate;

  //Assert: should have no failed VUs
  t.equal(
    jsonReportAggregate.counters['vusers.failed'],
    0,
    'should have no failed VUs'
  );

  //Assert: should have done http_requests and reported codes
  t.ok(
    jsonReportAggregate.counters['browser.http_requests'] > 0,
    'should have done http requests'
  );
  t.ok(
    jsonReportAggregate.counters['browser.page.codes.200'] > 0,
    'should have reported 200 codes'
  );

  t.ok(
    jsonReportAggregate.counters.custom_emitter > 0,
    'should have reported custom_emitter'
  );

  const { summaries, counters } = jsonReportAggregate;

  //Assert: reports steps as histograms
  t.hasProp(
    summaries,
    'browser.step.go_to_artillery_io',
    'should have reported step go_to_artillery_io as histogram'
  );
  t.ok(
    Object.keys(summaries['browser.step.go_to_artillery_io']).includes('p99'),
    'should have reported step go_to_artillery_io as histogram with p99 metric'
  );
  t.hasProp(
    summaries,
    'browser.step.go_to_docs',
    'should have reported step go_to_docs as histogram'
  );
  t.ok(
    Object.keys(summaries['browser.step.go_to_docs']).includes('p99'),
    'should have reported step go_to_docs as histogram with p99 metric'
  );

  //Assert: reports web vital metrics
  //TODO: improve this test to check for all web vitals. Checking for more consistently reported only now
  t.hasProp(
    summaries,
    `browser.page.TTFB.${TEST_URL}`,
    'should have reported TTFB'
  );
  t.hasProp(
    summaries,
    `browser.page.FCP.${TEST_URL}`,
    'should have reported FCP'
  );

  //Assert: reports extended metrics
  t.hasProp(
    summaries,
    'browser.memory_used_mb',
    'should have reported memory_used_mb'
  );
  t.hasProp(
    counters,
    'browser.page.domcontentloaded',
    'should have reported domcontentloaded counter'
  );
  t.hasProp(
    counters,
    `browser.page.domcontentloaded.${TEST_URL}`,
    'should have reported domcontentloaded counter for the test url'
  );
  t.hasProp(
    summaries,
    'browser.page.dominteractive',
    'should have reported dominteractive histogram'
  );
  t.hasProp(
    summaries,
    `browser.page.dominteractive.${TEST_URL}`,
    'should have reported domcontentloaded histogram for the test url'
  );
});

test('playwright typescript test fails and has correct vu count when expectation fails', async (t) => {
  const scenarioOverride = JSON.stringify({
    scenarios: [
      { engine: 'playwright', testFunction: 'playwrightFunctionWithFailure' }
    ]
  });

  try {
    await $`${A9_PATH} run:fargate ./test/fixtures/pw-acceptance-ts.yml --output ${playwrightOutput} --overrides ${scenarioOverride} --tags ${tags} --record`;
    t.fail(`Test "${t.name}" - Should have had non-zero exit code.`);
  } catch (output) {
    t.equal(
      output.exitCode,
      1,
      `should have exit code 1, got ${output.exitCode}`
    );

    const jsonReportAggregate = JSON.parse(
      fs.readFileSync(playwrightOutput, 'utf8')
    ).aggregate;

    t.equal(
      jsonReportAggregate.counters['vusers.failed'],
      3,
      'should have 3 failed VUs'
    );

    t.equal(
      jsonReportAggregate.counters['errors.pw_failed_assertion.toBeVisible'],
      3,
      'should have 3 failed assertions'
    );
  }
});
