import { test, afterEach } from 'tap';
import { $ } from 'zx';

afterEach(async () => {
  //cleanup output file after each test
  delete process.env.ARTILLERY_DISABLE_ENSURE;
});

test('works with multiple thresholds set', async (t) => {
  //Arrange: Plugin overrides
  const override = JSON.stringify({
    config: {
      plugins: { ensure: {} },
      ensure: {
        thresholds: [
          { 'vusers.created': 3 },
          { 'http.response_time.p99': 10000 }
        ]
      }
    }
  });

  //Act: run the test
  const output = await $`../artillery/bin/run run ./test/fixtures/scenario.yml --overrides ${override}`;

  // Assert
  t.ok(output.stdout.includes('Checks:', 'Console did not include Checks'));
  t.ok(output.stdout.includes('ok: vusers.created < 3'), 'Console did not include vusers.created check');
  t.ok(output.stdout.includes('ok: http.response_time.p99 < 10000'), 'Console did not include http.response_time.p99 check');
});

test('works with config under config.plugins.ensure instead', async (t) => {
  //Arrange: Plugin overrides
  const override = JSON.stringify({
    config: {
      plugins: {
        ensure: {
          thresholds: [
            { 'vusers.created': 3 },
            { 'http.response_time.p99': 10000 }
          ]
        }
      }
    }
  });

  //Act: run the test
  const output = await $`../artillery/bin/run run ./test/fixtures/scenario.yml --overrides ${override}`;

  // Assert
  t.ok(output.stdout.includes('Checks:'), 'Console did not include Checks');
  t.ok(output.stdout.includes('ok: vusers.created < 3'), 'Console did not include vusers.created check');
  t.ok(output.stdout.includes('ok: http.response_time.p99 < 10000'), 'Console did not include http.response_time.p99 check');
});

test('fails thresholds correctly', async (t) => {
  //Arrange: Plugin overrides
  const override = JSON.stringify({
    config: {
      plugins: { ensure: {} },
      ensure: {
        thresholds: [{ 'vusers.created': 3 }, { 'http.response_time.p99': 1 }]
      }
    }
  });

  try {
    //Act: run the test
    await $`../artillery/bin/run run ./test/fixtures/scenario.yml --overrides ${override}`;
  } catch (output) {

    //Assert
    t.equal(output.exitCode, 1, 'CLI Exit Code should be 1');
    t.ok(output.stdout.includes('Checks:', 'Console did not include Checks'));
    t.ok(output.stdout.includes('ok: vusers.created < 3'), 'Console did not include vusers.created check');
    t.ok(output.stdout.includes('fail: http.response_time.p99 < 1'), 'Console did not include http.response_time.p99 failed check');
  }
});

test('disables plugin correctly when process.env.ARTILLERY_DISABLE_ENSURE is set', async (t) => {
  //Arrange: Plugin overrides
  const override = JSON.stringify({
    config: {
      plugins: { ensure: {} },
      ensure: {
        thresholds: [{ 'vusers.created': 3 }, { 'http.response_time.p99': 1 }]
      }
    }
  });

  //Act: run the test
  process.env.ARTILLERY_DISABLE_ENSURE = true;
  const output = await $`../artillery/bin/run run ./test/fixtures/scenario.yml --overrides ${override}`;

  //Assert
  t.equal(output.exitCode, 0, 'CLI Exit Code should be 0');
  t.ok(!output.stdout.includes('Checks:'), 'Console did not include Checks');
  t.ok(!output.stdout.includes('ok: vusers.created < 3'), 'Console did not include vusers.created check');
  t.ok(!output.stdout.includes('fail: http.response_time.p99 < 1'), 'Console did not include http.response_time.p99 failed check');
});

test('passes and fails correctly multiple conditions and thresholds', async (t) => {
  //Arrange: Plugin overrides
  const failingExpression = 'vusers.created < 2 and vusers.failed == 0';
  const passingExpression =
    'http.downloaded_bytes > 0 or http.response_time.min > 1000';
  const override = JSON.stringify({
    config: {
      plugins: { ensure: {} },
      ensure: {
        thresholds: [{ 'http.response_time.p99': 1 }],
        conditions: [
          { expression: failingExpression },
          { expression: passingExpression }
        ]
      }
    }
  });

  try {
    //Act: run the test
    await $`../artillery/bin/run run ./test/fixtures/scenario.yml --overrides ${override}`;
  } catch (output) {

    //Assert
    t.equal(output.exitCode, 1, 'CLI Exit Code should be 1');
    t.ok(output.stdout.includes('Checks:'), 'Console did not include Checks');
    t.ok(output.stdout.includes('fail: http.response_time.p99 < 1'), 'Console did not include http.response_time.p99 threshold check');
    t.ok(output.stdout.includes(`fail: ${failingExpression}`), 'Console did not include failing expression check');
    t.ok(output.stdout.includes(`ok: ${passingExpression}`), 'Console did not include passing expression check');
  }
});

test('strict: false does not fail conditions correctly', async (t) => {
  //Arrange: Plugin overrides
  const failingExpression = 'vusers.created < 2 and vusers.failed == 0';
  const passingExpression =
    'http.downloaded_bytes > 0 or http.response_time.min > 1000';
  const override = JSON.stringify({
    config: {
      plugins: { ensure: {} },
      ensure: {
        conditions: [
          { expression: failingExpression, strict: false },
          { expression: passingExpression }
        ]
      }
    }
  });

  //Act: run the test
  const output = await $`../artillery/bin/run run ./test/fixtures/scenario.yml --overrides ${override}`;

  t.equal(output.exitCode, 0, 'CLI Exit Code should be 0');
  t.ok(output.stdout.includes('Checks:'), 'Console did not include Checks');

  t.ok(output.stdout.includes(`fail: ${failingExpression} (optional)`), 'Console did not include failing expression check with optional from strict');
  t.ok(output.stdout.includes(`ok: ${passingExpression}`), 'Console did not include passing expression check');
});

test('works with legacy thresholds (passing and failing) together with new thresholds', async (t) => {
  //Arrange: Plugin overrides
  const override = JSON.stringify({
    config: {
      plugins: { ensure: {} },
      ensure: {
        p99: 10000,
        max: 1,
        thresholds: [{ 'http.response_time.p95': 1 }]
      }
    }
  });

  try {
    //Act: run the test
    await $`../artillery/bin/run run ./test/fixtures/scenario.yml --overrides ${override}`;
  } catch (output) {
    // Assert
    t.equal(output.exitCode, 1, 'CLI Exit Code should be 1');
    t.ok(output.stdout.includes('Checks:'), 'Console did not include Checks');
    t.ok(output.stdout.includes('ok: p99 < 10000'), 'Console did not p99 check');
    t.ok(output.stdout.includes('fail: http.response_time.p95 < 1'), 'Console did not include p95 check');
    t.ok(output.stdout.includes('fail: max < 1'), 'Console did not include max check');
  }
});

test('works with legacy maxErrorRate', async (t) => {
  //Arrange: Plugin overrides
  const override = JSON.stringify({
    config: {
      target: 'http://notarealserver',
      plugins: { ensure: {} },
      ensure: {
        maxErrorRate: 0
      }
    }
  });

  try {
    //Act: run the test
    await $`../artillery/bin/run run ./test/fixtures/scenario.yml --overrides ${override}`;
  } catch (output) {
    // Assert
    t.equal(output.exitCode, 1, 'CLI Exit Code should be 1');
    t.ok(output.stdout.includes('Checks:', 'Console did not include Checks'));
    t.ok(output.stdout.includes('fail: maxErrorRate < 0'), 'Console did not include maxErrorRate check');
  }
});
