const fs = require('fs');
const { startTestServer } = require('./util.js');
const { test, afterEach } = require('tap');
const { $ } = require('zx');

let childProcess;

afterEach(async () => {
  //cleanup output file after each test
  fs.unlinkSync('./test/output.json');
  childProcess.kill();
});

test('cpu and memory metrics display in the aggregate report with the correct name and unit', async (t) => {
  //Arrange: Test Server and Plugin overrides
  const testServer = await startTestServer();
  childProcess = testServer.childProcess;

  const override = JSON.stringify({
    config: {
      plugins: {
        'memory-inspector': [
          { pid: testServer.currentPid, name: 'express-example', unit: 'kb' }
        ]
      }
    }
  });

  //Act: run the test and get report
  const output =
    await $`TEST_PORT=${testServer.currentPort} ../artillery/bin/run run ./test/fixtures/scenario.yml --overrides ${override} --output ./test/output.json`;
  const report = JSON.parse(fs.readFileSync('./test/output.json'));

  //Assert:
  //plugin doesn't mess with existing before scenario handlers
  t.ok(
    output.stdout.includes(
      'Hello from the Handler!',
      'Issue with running existing Before Scenario Handler!'
    )
  );

  //sanity check that it can reach server
  t.ok(
    report.aggregate.counters['http.codes.200'] > 0,
    'Should have 200 status codes'
  );

  //assert that correct custom metrics are emitted
  t.hasProp(
    report.aggregate.summaries,
    'express-example.cpu',
    "Aggregate Summaries doesn't have CPU metric"
  );
  t.hasProp(
    report.aggregate.summaries,
    'express-example.memory',
    "Aggregate Summaries doesn't have Memory metric"
  );
  t.hasProp(
    report.aggregate.histograms,
    'express-example.cpu',
    "Aggregate Histograms doesn't have CPU metric"
  );
  t.hasProp(
    report.aggregate.histograms,
    'express-example.memory',
    "Aggregate Histograms doesn't have Memory metric"
  );

  //assert that kb unit is used
  for (const [metric, value] of Object.entries(
    report.aggregate.summaries['express-example.memory']
  )) {
    if (metric == 'count') {
      continue;
    }

    const lengthOfValue = Math.round(value).toString().length;
    t.ok(
      lengthOfValue > 3 && lengthOfValue <= 6,
      `Length of value ${value} should be in KB (more than mb unit, less than byte unit)`
    );
  }
});

test('cpu and memory metrics display in the aggregate report with a default name and unit when no name is given', async (t) => {
  //Arrange: Test Server and Plugin overrides
  const testServer = await startTestServer();
  childProcess = testServer.childProcess;

  const override = JSON.stringify({
    config: {
      plugins: {
        'memory-inspector': [{ pid: testServer.currentPid }]
      }
    }
  });

  //Act: run the test and get report
  await $`TEST_PORT=${testServer.currentPort} ../artillery/bin/run run ./test/fixtures/scenario.yml --overrides ${override} --output ./test/output.json`;
  const report = JSON.parse(fs.readFileSync('./test/output.json'));

  //Assert
  //sanity check that it can reach server
  t.ok(
    report.aggregate.counters['http.codes.200'] > 0,
    'Should have 200 status codes'
  );

  //assert that correct custom metrics are emitted
  t.hasProp(
    report.aggregate.summaries,
    `process_${testServer.currentPid}.cpu`,
    "Aggregate Summaries doesn't have CPU metric"
  );
  t.hasProp(
    report.aggregate.summaries,
    `process_${testServer.currentPid}.memory`,
    "Aggregate Summaries doesn't have Memory metric"
  );
  t.hasProp(
    report.aggregate.histograms,
    `process_${testServer.currentPid}.cpu`,
    "Aggregate Histograms doesn't have CPU metric"
  );
  t.hasProp(
    report.aggregate.histograms,
    `process_${testServer.currentPid}.memory`,
    "Aggregate Histograms doesn't have Memory metric"
  );

  //assert that mb unit is used by default
  for (const [metric, value] of Object.entries(
    report.aggregate.summaries[`process_${testServer.currentPid}.memory`]
  )) {
    if (metric == 'count') {
      continue;
    }

    const lengthOfValue = Math.round(value).toString().length;
    t.ok(
      lengthOfValue <= 3,
      `Length of value ${value} in MB should be less than 4`
    );
  }
});

test('cpu and memory metrics also display in the aggregate report for artillery internals', async (t) => {
  //Arrange: Test Server and Plugin overrides
  const testServer = await startTestServer();
  childProcess = testServer.childProcess;

  const override = JSON.stringify({
    config: {
      plugins: {
        'memory-inspector': [
          { pid: testServer.currentPid, name: 'express-example' }
        ]
      }
    }
  });

  //Act: run the test and get report
  await $`TEST_PORT=${testServer.currentPort} ARTILLERY_INTROSPECT_MEMORY=true ../artillery/bin/run run ./test/fixtures/scenario.yml --overrides ${override} --output ./test/output.json`;
  const report = JSON.parse(fs.readFileSync('./test/output.json'));

  //Assert
  //sanity check that it can reach server
  t.ok(
    report.aggregate.counters['http.codes.200'] > 0,
    'Should have 200 status codes'
  );

  //assert that correct custom metrics are emitted
  t.hasProp(
    report.aggregate.summaries,
    'express-example.cpu',
    "Aggregate Summaries doesn't have CPU metric"
  );
  t.hasProp(
    report.aggregate.summaries,
    'express-example.memory',
    "Aggregate Summaries doesn't have Memory metric"
  );
  t.hasProp(
    report.aggregate.histograms,
    'express-example.cpu',
    "Aggregate Histograms doesn't have CPU metric"
  );
  t.hasProp(
    report.aggregate.histograms,
    'express-example.memory',
    "Aggregate Histograms doesn't have Memory metric"
  );

  //assert that additional artillery internal metrics are emmitted
  t.hasProp(
    report.aggregate.summaries,
    'artillery_internal.memory',
    "Aggregate Summaries doesn't have Artillery Memory metric"
  );
  t.hasProp(
    report.aggregate.summaries,
    'artillery_internal.external',
    "Aggregate Summaries doesn't have Artillery External metric"
  );
  t.hasProp(
    report.aggregate.summaries,
    'artillery_internal.heap_used',
    "Aggregate Summaries doesn't have Artillery Heap Used metric"
  );
  t.hasProp(
    report.aggregate.summaries,
    'artillery_internal.heap_total',
    "Aggregate Summaries doesn't have Artillery Heap Total metric"
  );

  t.hasProp(
    report.aggregate.histograms,
    'artillery_internal.memory',
    "Aggregate Histograms doesn't have Artillery Memory metric"
  );
  t.hasProp(
    report.aggregate.histograms,
    'artillery_internal.external',
    "Aggregate Histograms doesn't have Artillery External metric"
  );
  t.hasProp(
    report.aggregate.histograms,
    'artillery_internal.heap_used',
    "Aggregate Histograms doesn't have Artillery Heap Used metric"
  );
  t.hasProp(
    report.aggregate.histograms,
    'artillery_internal.heap_total',
    "Aggregate Histograms doesn't have Artillery Heap Total metric"
  );

  //assert that mb unit is used by default
  for (const [metric, value] of Object.entries(
    report.aggregate.summaries['artillery_internal.memory']
  )) {
    if (metric == 'count') {
      continue;
    }

    const lengthOfValue = Math.round(value).toString().length;
    t.ok(
      lengthOfValue <= 3,
      `Length of value ${value} in MB should be less than 4`
    );
  }
});
