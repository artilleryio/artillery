const { test, afterEach } = require('tap');
const { $ } = require('zx');
const chalk = require('chalk');

afterEach(async () => {
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
  const output =
    await $`../artillery/bin/run run ./test/fixtures/scenario.yml --overrides ${override}`;

  // Assert
  t.ok(output.stdout.includes('Checks:', 'Console did not include Checks'));
  t.ok(
    output.stdout.includes(`${chalk.green('ok')}: vusers.created < 3`),
    'Console did not include vusers.created check'
  );
  t.ok(
    output.stdout.includes(
      `${chalk.green('ok')}: http.response_time.p99 < 10000`
    ),
    'Console did not include http.response_time.p99 check'
  );
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
  const output =
    await $`../artillery/bin/run run ./test/fixtures/scenario.yml --overrides ${override}`;

  // Assert
  t.ok(output.stdout.includes('Checks:'), 'Console did not include Checks');
  t.ok(
    output.stdout.includes(`${chalk.green('ok')}: vusers.created < 3`),
    'Console did not include vusers.created check'
  );
  t.ok(
    output.stdout.includes(
      `${chalk.green('ok')}: http.response_time.p99 < 10000`
    ),
    'Console did not include http.response_time.p99 check'
  );
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
    t.fail(`Test "${t.name}" - Should have had non-zero exit code.`);
  } catch (output) {
    //Assert
    t.equal(output.exitCode, 1, 'CLI Exit Code should be 1');
    t.ok(output.stdout.includes('Checks:', 'Console did not include Checks'));
    t.ok(
      output.stdout.includes(`${chalk.green('ok')}: vusers.created < 3`),
      'Console did not include vusers.created check'
    );
    t.ok(
      output.stdout.includes(
        `${chalk.red('fail')}: http.response_time.p99 < 1`
      ),
      'Console did not include http.response_time.p99 failed check'
    );
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
  const output =
    await $`../artillery/bin/run run ./test/fixtures/scenario.yml --overrides ${override}`;

  //Assert
  t.equal(output.exitCode, 0, 'CLI Exit Code should be 0');
  t.ok(!output.stdout.includes('Checks:'), 'Console did not include Checks');
  t.ok(
    !output.stdout.includes(`${chalk.green('ok')}: vusers.created < 3`),
    'Console did not include vusers.created check'
  );
  t.ok(
    !output.stdout.includes(`${chalk.red('fail')}: http.response_time.p99 < 1`),
    'Console did not include http.response_time.p99 failed check'
  );
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
    t.fail(`Test "${t.name}" - Should have had non-zero exit code.`);
  } catch (output) {
    //Assert
    t.equal(output.exitCode, 1, 'CLI Exit Code should be 1');
    t.ok(output.stdout.includes('Checks:'), 'Console did not include Checks');
    t.ok(
      output.stdout.includes(
        `${chalk.red('fail')}: http.response_time.p99 < 1`
      ),
      'Console did not include http.response_time.p99 threshold check'
    );
    t.ok(
      output.stdout.includes(`${chalk.red('fail')}: ${failingExpression}`),
      'Console did not include failing expression check'
    );
    t.ok(
      output.stdout.includes(`${chalk.green('ok')}: ${passingExpression}`),
      'Console did not include passing expression check'
    );
  }
});

test('strict set to false correctly does not fail conditions', async (t) => {
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
  const output =
    await $`../artillery/bin/run run ./test/fixtures/scenario.yml --overrides ${override}`;

  t.equal(output.exitCode, 0, 'CLI Exit Code should be 0');
  t.ok(output.stdout.includes('Checks:'), 'Console did not include Checks');

  t.ok(
    output.stdout.includes(
      `${chalk.red('fail')}: ${failingExpression} (optional)`
    ),
    'Console did not include failing expression check with optional from strict'
  );
  t.ok(
    output.stdout.includes(`${chalk.green('ok')}: ${passingExpression}`),
    'Console did not include passing expression check'
  );
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
    t.fail(`Test "${t.name}" - Should have had non-zero exit code.`);
  } catch (output) {
    // Assert
    t.equal(output.exitCode, 1, 'CLI Exit Code should be 1');
    t.ok(output.stdout.includes('Checks:'), 'Console did not include Checks');
    t.ok(
      output.stdout.includes(`${chalk.green('ok')}: p99 < 10000`),
      'Console did not p99 check'
    );
    t.ok(
      output.stdout.includes(
        `${chalk.red('fail')}: http.response_time.p95 < 1`
      ),
      'Console did not include p95 check'
    );
    t.ok(
      output.stdout.includes(`${chalk.red('fail')}: max < 1`),
      'Console did not include max check'
    );
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
    t.fail(`Test "${t.name}" - Should have had non-zero exit code.`);
  } catch (output) {
    // Assert
    t.equal(output.exitCode, 1, 'CLI Exit Code should be 1');
    t.ok(output.stdout.includes('Checks:', 'Console did not include Checks'));
    t.ok(
      output.stdout.includes(`${chalk.red('fail')}: maxErrorRate < 0`),
      'Console did not include maxErrorRate check'
    );
  }
});

test('checks are grouped in the correct order (ok first, fail after)', async (t) => {
  //Arrange: Plugin overrides
  const override = JSON.stringify({
    config: {
      plugins: { ensure: {} },
      ensure: {
        p99: 10000,
        max: 1,
        thresholds: [{ 'http.response_time.p95': 1 }],
        maxErrorRate: 0
      }
    }
  });

  try {
    //Act: run the test
    await $`../artillery/bin/run run ./test/fixtures/scenario.yml --overrides ${override}`;
    t.fail(`Test "${t.name}" - Should have had non-zero exit code.`);
  } catch (output) {
    const startIndex = output.stdout.indexOf('Checks:');
    // Get the relevant logs (the first 4 lines after the Checks: line)
    const relevantLogs = output.stdout
      .slice(startIndex)
      .split('\n')
      .slice(1, 5);

    // Assert
    t.equal(output.exitCode, 1, 'CLI Exit Code should be 1');
    t.ok(output.stdout.includes('Checks:', 'Console did not include Checks'));
    t.ok(
      relevantLogs[0] == `${chalk.green('ok')}: maxErrorRate < 0` ||
        relevantLogs[0] == `${chalk.green('ok')}: p99 < 10000`,
      'First check should be a passed expectation'
    );
    t.ok(
      relevantLogs[1] == `${chalk.green('ok')}: maxErrorRate < 0` ||
        relevantLogs[1] == `${chalk.green('ok')}: p99 < 10000`,
      'Second check should be a passed expectation'
    );
    t.ok(
      relevantLogs[2] == `${chalk.red('fail')}: max < 1` ||
        relevantLogs[2] == `${chalk.red('fail')}: http.response_time.p95 < 1`,
      'Third check should be a failed expectation'
    );
    t.ok(
      relevantLogs[3] == `${chalk.red('fail')}: max < 1` ||
        relevantLogs[3] == `${chalk.red('fail')}: http.response_time.p95 < 1`,
      'Fourth check should be a failed expectation'
    );
  }
});

test('works with custom metrics including weird characters like urls', async (t) => {
  //Arrange: Plugin overrides
  const failingExpression =
    'browser.page.FCP.https://www.artillery.io/13eba89r?a>;02-.min < 1 and vusers.created == 2';
  const passingExpression =
    'browser.page.FCP.https://www.artillery.io/13eba89r?a>;02-.p99 < 1 or vusers.created_by_name.ensure Plug$n custom metrics.p99. (a1rb3nd3r) == 2';
  const override = JSON.stringify({
    config: {
      plugins: { ensure: {} },
      ensure: {
        thresholds: [
          {
            'browser.page.FCP.https://www.artillery.io/13eba89r?a>;02-.median': 1000
          }
        ],
        conditions: [
          { expression: failingExpression },
          { expression: passingExpression }
        ]
      }
    }
  });

  try {
    //Act: run the test
    await $`../artillery/bin/run run ./test/fixtures/scenario-custom-metrics.yml --overrides ${override}`;
    t.fail(`Test "${t.name}" - Should have had non-zero exit code.`);
  } catch (output) {
    //Assert
    t.equal(output.exitCode, 1, 'CLI Exit Code should be 1');
    t.ok(output.stdout.includes('Checks:'), 'Console did not include Checks');
    t.ok(
      output.stdout.includes(
        `${chalk.green(
          'ok'
        )}: browser.page.FCP.https://www.artillery.io/13eba89r?a>;02-.median < 1000`
      ),
      'Console did not include browser.page.FCP.https://www.artillery.io/13eba89r?a>;02-.median threshold check'
    );
    t.ok(
      output.stdout.includes(`${chalk.red('fail')}: ${failingExpression}`),
      'Console did not include failing expression check'
    );
    t.ok(
      output.stdout.includes(`${chalk.green('ok')}: ${passingExpression}`),
      'Console did not include passing expression check'
    );
  }
});

test('works with templated values used in metrics', async (t) => {
  //Arrange: Plugin overrides
  const passingExpression =
    'http.downloaded_bytes >= {{ conditionVar }} or http.response_time.min >= {{ conditionVar }}';
  const override = JSON.stringify({
    config: {
      plugins: { ensure: {} },
      ensure: {
        thresholds: [
          {
            'browser.page.FCP.https://www.artillery.io/13eba89r?a>;02-.median':
              '{{ thresholdVar }}'
          }
        ],
        conditions: [{ expression: passingExpression }]
      }
    }
  });

  const variables = JSON.stringify({
    conditionVar: 0,
    thresholdVar: 1000
  });

  //Act: run the test
  const output =
    await $`../artillery/bin/run run ./test/fixtures/scenario-custom-metrics.yml --overrides ${override} --variables ${variables}`;
  t.equal(output.exitCode, 0, 'CLI Exit Code should be 0');
  t.ok(output.stdout.includes('Checks:'), 'Console did not include Checks');

  t.ok(
    output.stdout.includes(
      `${chalk.green(
        'ok'
      )}: browser.page.FCP.https://www.artillery.io/13eba89r?a>;02-.median < 1000`
    ),
    'Console did not include browser.page.FCP.https://www.artillery.io/13eba89r?a>;02-.median threshold check'
  );

  t.ok(
    output.stdout.includes(
      `${chalk.green(
        'ok'
      )}: http.downloaded_bytes >= 0 or http.response_time.min >= 0`
    ),
    'Console did not include passing expression check'
  );
});
