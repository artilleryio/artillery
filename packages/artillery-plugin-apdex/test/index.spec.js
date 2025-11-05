const { test } = require('tap');
const { $ } = require('zx');

test('apdex plugin works when other after response hooks are set', async (t) => {
  //Arrange: Plugin overrides
  const override = JSON.stringify({
    config: {
      plugins: { apdex: {} },
      apdex: {
        threshold: 100
      }
    }
  });

  //Act: run the test
  const output =
    await $`../artillery/bin/run run ./test/fixtures/scenario.yml --overrides ${override}`;

  const apdexRegex =
    /Apdex score: (\d(?:\.\d+)?) \((unacceptable|poor|fair|good|excellent)\)/;

  const apdexTest = apdexRegex.test(output.stdout);
  const afterResponseOccurrences = (
    output.stdout.match(
      new RegExp(/After Response Handler still working/, 'g')
    ) || []
  ).length;

  // Assert
  t.ok(apdexTest, 'Console did not include Apdex score');
  t.equal(
    afterResponseOccurrences,
    5,
    'After Response Handler did not run five times'
  );
});

// Related to the following discussion: https://github.com/artilleryio/artillery/discussions/2209
test('apdex plugin reports all apdex metrics even if they never occured', async (t) => {
  //Arrange: Plugin overrides
  const override = JSON.stringify({
    config: {
      plugins: { apdex: {} },
      apdex: {
        threshold: 100
      }
    }
  });

  //Act: run the test
  const output =
    await $`../artillery/bin/run run ./test/fixtures/scenario.yml --overrides ${override}`;
  const allMetricsReported =
    output.stdout.includes('apdex.satisfied:') &&
    output.stdout.includes('apdex.tolerated:') &&
    output.stdout.includes('apdex.frustrated:');
  t.ok(
    allMetricsReported,
    'All Apdex metrics counters are displayed in the report'
  );
});
