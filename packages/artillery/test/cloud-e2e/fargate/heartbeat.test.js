const { test, before } = require('tap');
const { spawn } = require('node:child_process');
const {
  ECSClient,
  ListTasksCommand
} = require('@aws-sdk/client-ecs');
const { getTestTags } = require('../../helpers');

const A9_PATH = process.env.A9_PATH || 'artillery';
const REGION = 'eu-west-1';
const CLUSTER = 'artilleryio-cluster';

const HEARTBEAT_THRESHOLD_S = 180;
const POLL_INTERVAL_MS = 30_000;
const POLL_TIMEOUT_MS = 300_000;

const baseTags = getTestTags(['type:acceptance']);
const ecs = new ECSClient({ region: REGION });

function listRunningTasks(startedBy) {
  return ecs.send(
    new ListTasksCommand({
      cluster: CLUSTER,
      startedBy,
      desiredStatus: 'RUNNING'
    })
  );
}

function waitForOutput(proc, pattern, timeoutMs = 180_000) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for "${pattern}" in output`));
    }, timeoutMs);

    const onData = (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
      if (output.includes(pattern)) {
        clearTimeout(timer);
        proc.stdout.removeListener('data', onData);
        resolve(output);
      }
    };

    proc.stdout.on('data', onData);
    proc.stderr.on('data', (chunk) => process.stderr.write(chunk.toString()));
  });
}

function extractTestId(output) {
  const match = output.match(/Test run ID:\s+(\S+)/);
  if (!match) {
    throw new Error('Could not extract test run ID from output');
  }
  return match[1];
}

before(async () => {
  const { spawn: zxSpawn } = require('node:child_process');
  await new Promise((resolve, reject) => {
    const proc = zxSpawn(A9_PATH, ['-V'], { stdio: 'inherit' });
    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`artillery -V exited ${code}`))
    );
  });
});

test('Workers self-terminate when CLI is killed (heartbeat)', async (t) => {
  const scenarioPath = `${__dirname}/fixtures/heartbeat/heartbeat.yml`;
  const args = [
    'run-fargate',
    scenarioPath,
    '--region',
    REGION,
    '--record',
    '--tags',
    `${baseTags},test:heartbeat`
  ];

  // 1. Spawn artillery CLI
  const proc = spawn(A9_PATH, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env }
  });

  t.teardown(() => {
    try {
      proc.kill('SIGKILL');
    } catch (_) {}
  });

  // 2. Wait for workers to be running
  const output = await waitForOutput(proc, 'Workers are running');
  const testId = extractTestId(output);
  t.ok(testId, `Got test run ID: ${testId}`);

  // 3. SIGKILL the CLI — no graceful shutdown
  t.comment(`Sending SIGKILL to artillery process (PID ${proc.pid})`);
  proc.kill('SIGKILL');
  const killTime = Date.now();

  // 4. Confirm tasks are still running
  const tasksAfterKill = await listRunningTasks(testId);
  const runningCount = (tasksAfterKill.taskArns || []).length;
  t.ok(runningCount > 0, `Tasks still running after SIGKILL: ${runningCount}`);

  // 5. Poll until tasks stop
  t.comment(
    `Polling for task termination (interval=${POLL_INTERVAL_MS / 1000}s, timeout=${POLL_TIMEOUT_MS / 1000}s)`
  );

  let tasksStopped = false;
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const result = await listRunningTasks(testId);
    const remaining = (result.taskArns || []).length;
    const elapsed = Math.round((Date.now() - killTime) / 1000);
    t.comment(`  ${elapsed}s elapsed — ${remaining} task(s) still running`);

    if (remaining === 0) {
      tasksStopped = true;
      break;
    }
  }

  const totalElapsed = (Date.now() - killTime) / 1000;
  t.comment(`Total time from SIGKILL to tasks stopped: ${totalElapsed.toFixed(0)}s`);

  // 6. Assertions
  t.ok(tasksStopped, 'Tasks stopped within timeout');
  t.ok(
    totalElapsed > HEARTBEAT_THRESHOLD_S,
    `Tasks ran longer than heartbeat threshold (${totalElapsed.toFixed(0)}s > ${HEARTBEAT_THRESHOLD_S}s)`
  );
  t.ok(
    totalElapsed < POLL_TIMEOUT_MS / 1000,
    `Tasks stopped before poll timeout (${totalElapsed.toFixed(0)}s < ${POLL_TIMEOUT_MS / 1000}s)`
  );
});
