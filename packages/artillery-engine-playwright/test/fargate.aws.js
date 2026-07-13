const { test, afterEach, beforeEach, before } = require('node:test');
const assert = require('node:assert');
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

  assert.strictEqual(output.exitCode, 0, `should have exit code 0, got ${output.exitCode}`);

  const jsonReportAggregate = JSON.parse(
    fs.readFileSync(playwrightOutput, 'utf8')
  ).aggregate;

  //Assert: should have no failed VUs
  assert.strictEqual(jsonReportAggregate.counters['vusers.failed'], 0, 'should have no failed VUs');

  //Assert: should have done http_requests and reported codes
  assert.ok(jsonReportAggregate.counters['browser.http_requests'] > 0, 'should have done http requests');
  assert.ok(jsonReportAggregate.counters['browser.page.codes.200'] > 0, 'should have reported 200 codes');

  assert.ok(jsonReportAggregate.counters.custom_emitter > 0, 'should have reported custom_emitter');

  const { summaries, counters } = jsonReportAggregate;

  //Assert: reports steps as histograms
  assert.ok('browser.step.go_to_artillery_io' in summaries, 'should have reported step go_to_artillery_io as histogram');
  assert.ok(Object.keys(summaries['browser.step.go_to_artillery_io']).includes('p99'), 'should have reported step go_to_artillery_io as histogram with p99 metric');
  assert.ok('browser.step.go_to_docs' in summaries, 'should have reported step go_to_docs as histogram');
  assert.ok(Object.keys(summaries['browser.step.go_to_docs']).includes('p99'), 'should have reported step go_to_docs as histogram with p99 metric');

  //Assert: reports web vital metrics
  //TODO: improve this test to check for all web vitals. Checking for more consistently reported only now
  assert.ok(`browser.page.TTFB.${TEST_URL}` in summaries, 'should have reported TTFB');
  assert.ok(`browser.page.FCP.${TEST_URL}` in summaries, 'should have reported FCP');

  //Assert: reports extended metrics
  assert.ok('browser.memory_used_mb' in summaries, 'should have reported memory_used_mb');
  assert.ok('browser.page.domcontentloaded' in counters, 'should have reported domcontentloaded counter');
  assert.ok(`browser.page.domcontentloaded.${TEST_URL}` in counters, 'should have reported domcontentloaded counter for the test url');
  assert.ok('browser.page.dominteractive' in summaries, 'should have reported dominteractive histogram');
  assert.ok(`browser.page.dominteractive.${TEST_URL}` in summaries, 'should have reported domcontentloaded histogram for the test url');
});

test('playwright typescript test fails and has correct vu count when expectation fails', async (t) => {
  const scenarioOverride = JSON.stringify({
    scenarios: [
      { engine: 'playwright', testFunction: 'playwrightFunctionWithFailure' }
    ]
  });

  try {
    await $`${A9_PATH} run:fargate ./test/fixtures/pw-acceptance-ts.yml --output ${playwrightOutput} --overrides ${scenarioOverride} --tags ${tags} --record`;
    assert.fail(`Test "${t.name}" - Should have had non-zero exit code.`);
  } catch (output) {
    assert.strictEqual(output.exitCode, 1, `should have exit code 1, got ${output.exitCode}`);

    const jsonReportAggregate = JSON.parse(
      fs.readFileSync(playwrightOutput, 'utf8')
    ).aggregate;

    assert.strictEqual(jsonReportAggregate.counters['vusers.failed'], 3, 'should have 3 failed VUs');

    assert.strictEqual(jsonReportAggregate.counters['errors.pw_failed_assertion.toBeVisible'], 3, 'should have 3 failed assertions');
  }
});
