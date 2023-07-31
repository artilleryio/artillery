import fs from 'fs';
import portfinder from 'portfinder';
import { test, beforeEach, afterEach } from 'tap';
import { exec } from 'child_process';
import { $ } from 'zx';

let childProcess;
let currentPid;
let currentPort;

beforeEach(async () => {
  currentPort = await portfinder.getPortPromise({
    port: 4444,
    stopPort: 4600
  });
  childProcess = exec('node ./test/server/server.mjs', {
    env: {
      ...process.env,
      TEST_PORT: `${currentPort}`
    }
  });
  currentPid = childProcess.pid;
});

afterEach(async () => {
  childProcess.kill();
  fs.unlinkSync('./test/output.json');
});

test('cpu and memory metrics display in the aggregate report with the correct name', async (t) => {
  const override = JSON.stringify({
    config: {
      plugins: {
        'memory-inspector': [{ pid: currentPid, name: 'express-example' }]
      }
    }
  });

  const output =
    await $`TEST_PORT=${currentPort} ../artillery/bin/run run ./test/fixtures/scenario.yml --overrides ${override} --output ./test/output.json`;
  const report = JSON.parse(fs.readFileSync('./test/output.json'));

  //assert that plugin doesn't mess with existing before scenario handlers
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
});

test('cpu and memory metrics display in the aggregate report with a default name when no name is given', async (t) => {
  const override = JSON.stringify({
    config: {
      plugins: {
        'memory-inspector': [{ pid: currentPid }]
      }
    }
  });

  await $`TEST_PORT=${currentPort} ../artillery/bin/run run ./test/fixtures/scenario.yml --overrides ${override} --output ./test/output.json`;
  const report = JSON.parse(fs.readFileSync('./test/output.json'));

  //sanity check that it can reach server
  t.ok(
    report.aggregate.counters['http.codes.200'] > 0,
    'Should have 200 status codes'
  );

  //assert that correct custom metrics are emitted
  t.hasProp(
    report.aggregate.summaries,
    `process_${currentPid}.cpu`,
    "Aggregate Summaries doesn't have CPU metric"
  );
  t.hasProp(
    report.aggregate.summaries,
    `process_${currentPid}.memory`,
    "Aggregate Summaries doesn't have Memory metric"
  );
  t.hasProp(
    report.aggregate.histograms,
    `process_${currentPid}.cpu`,
    "Aggregate Histograms doesn't have CPU metric"
  );
  t.hasProp(
    report.aggregate.histograms,
    `process_${currentPid}.memory`,
    "Aggregate Histograms doesn't have Memory metric"
  );
});

test('cpu and memory metrics display in the aggregate report with a default name when no name is given', async (t) => {
  const override = JSON.stringify({
    config: {
      plugins: {
        'memory-inspector': [{ pid: currentPid, name: 'express-example' }]
      }
    }
  });

  await $`TEST_PORT=${currentPort} ARTILLERY_INTROSPECT_MEMORY=true ../artillery/bin/run run ./test/fixtures/scenario.yml --overrides ${override} --output ./test/output.json`;
  const report = JSON.parse(fs.readFileSync('./test/output.json'));

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
});
