#!/usr/bin/env node
// Node.js rewrite of the bash loadgen-worker. Runs on Fargate (ECS task
// definition overrides entryPoint to /artillery/loadgen-worker, a CJS
// shim that imports this module's compiled output) and on Azure ACI.
// Log line formats, queue message shapes and exit codes are contracts —
// see the rewrite plan before changing them.

import type { ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { decodeCliArgs, parseWorkerArgs, USAGE } from './args.ts';
import type { MessageBus } from './bus.ts';
import { AqsBus } from './bus-aqs.ts';
import { SqsBus } from './bus-sqs.ts';
import {
  buildConfig,
  EXIT,
  type WorkerConfig,
  WorkerError
} from './config.ts';
import { extractEnsureSpec } from './ensure.ts';
import { HeartbeatMonitor } from './heartbeat.ts';
import { installDependencies } from './install.ts';
import { debug, progress } from './log.ts';
import { isRunning, killWithGrace, waitForChildExit } from './proc.ts';
import { startCli } from './run-cli.ts';
import type { Storage } from './storage.ts';
import { waitForObject } from './storage.ts';
import {
  AzureBlobStorage,
  azureCredentialCheck,
  createAzureCredential
} from './storage-azure.ts';
import { S3Storage } from './storage-s3.ts';
import { resolveWorkerId } from './worker-id.ts';

interface RunState {
  child: ChildProcess | null;
  cliRunning: boolean;
  cleaningUp: boolean;
}

const state: RunState = {
  child: null,
  cliRunning: false,
  cleaningUp: false
};

let bus: MessageBus | null = null;
let finishPromise: Promise<never> | null = null;

// Single exit path (bash EXIT trap equivalent): send the final queue
// event, then exit explicitly (SDK sockets may keep the loop alive).
// Idempotent — the first caller's exit code wins.
// NOTE: workerError.exitCode is a JSON *string* on purpose; the
// controller compares against the number 21 and relies on the mismatch.
function finish(code: number): Promise<never> {
  if (!finishPromise) {
    finishPromise = (async () => {
      if (bus) {
        if (code === 0) {
          await bus.sendEvent({ event: 'workerDone' });
        } else {
          await bus.sendEvent({ event: 'workerError', exitCode: String(code) });
        }
      }
      // Flush piped stdout/stderr before exiting — process.exit can
      // truncate pending pipe writes (awslogs driver reads a pipe).
      await new Promise<void>((resolve) => {
        process.stdout.write('', () => {
          process.stderr.write('', () => resolve());
        });
      });
      process.exit(code);
    })();
  }
  return finishPromise;
}

// SIGTERM/SIGINT (ECS StopTask sends TERM, KILL after ~30s).
async function onSignal(sig: NodeJS.Signals): Promise<void> {
  debug('cleanup called, signal:');
  debug(sig);

  if (state.cleaningUp) {
    console.log(`Received ${sig} but cleaning up already`);
    return;
  }
  state.cleaningUp = true;

  if (state.cliRunning && state.child) {
    console.log(`Interrupted with ${sig}, stopping`);
    const child = state.child;
    child.kill('SIGTERM');
    const exited = await waitForChildExit(child, 20_000);
    if (!exited && isRunning(child)) {
      child.kill('SIGKILL');
      await waitForChildExit(child, 5_000);
    }
    state.cliRunning = false;
  }

  await finish(EXIT.ERR_INTERRUPTED);
}

async function signalReady(
  cfg: WorkerConfig,
  storage: Storage,
  messageBus: MessageBus
): Promise<void> {
  const fileName = `synced_${cfg.workerId}.json`;
  const localPath = path.join(cfg.testDataDir, fileName);
  await fs.writeFile(localPath, `{ "worker_id": "${cfg.workerId}" }\n`);

  if (cfg.mode === 'azure') {
    await messageBus.sendEvent({ event: 'workerReady' });
  }

  try {
    await storage.upload(localPath, storage.syncedMarkerRef(fileName));
  } catch (err) {
    debug((err as Error).message);
    console.log(
      `could not send synced signal (to: ${storage.syncedMarkerDest(fileName)})`
    );
    throw new WorkerError(
      EXIT.ERR_SIGNAL_SYNC,
      'could not send synced signal'
    );
  }
  console.log(`Worker ${cfg.workerId} synced up & ready`);
}

// Run the CLI, monitor the heartbeat, extract the ensure spec, upload
// the worker log. Returns the worker exit code.
async function runAndReport(
  cfg: WorkerConfig,
  storage: Storage,
  messageBus: MessageBus
): Promise<number> {
  const { child, exited } = startCli(cfg);
  state.child = child;
  state.cliRunning = true;

  let monitor: HeartbeatMonitor | null = null;
  if (cfg.mode === 'aws') {
    monitor = new HeartbeatMonitor({
      fetchHeartbeat: () => storage.fetchHeartbeat(),
      onTimeout: () => killWithGrace(child, 15_000)
    });
    monitor.start();
  }

  let cliStatus: number;
  try {
    cliStatus = await exited;
  } finally {
    monitor?.stop();
    state.cliRunning = false;
    state.child = null;
  }

  if (state.cleaningUp) {
    // Signal handler owns shutdown; it sends workerError("7") and exits.
    return EXIT.ERR_INTERRUPTED;
  }

  console.log(`Finished with code ${cliStatus}`);

  // Ensure spec: printed by the inspect-script plugin into the CLI
  // output; the controller decodes it and runs ensure checks centrally.
  try {
    const outputText = await fs.readFile(
      path.join(cfg.testDataDir, 'output.txt'),
      'utf8'
    );
    const ensureSpec = extractEnsureSpec(outputText);
    if (ensureSpec !== null) {
      console.log('got ensure spec');
      await messageBus.sendMessage(ensureSpec, 'ensure');
    } else {
      console.error('no ensure spec');
    }
  } catch {
    console.error('error while looking for ensure spec, ignoring');
  }

  const logRef = storage.workerLogRef(cfg.workerId);
  if (logRef) {
    try {
      await storage.upload(path.join(cfg.testDataDir, 'output.txt'), logRef);
      console.log(`log: ${logRef}`);
    } catch (err) {
      // Best-effort: a failed log copy must not fail the whole run.
      console.error(
        `Warning: could not upload worker log: ${(err as Error).message}`
      );
    }
  }

  if (monitor?.timedOut) {
    return EXIT.ERR_HEARTBEAT_TIMEOUT;
  }
  if (cliStatus === 0) {
    return EXIT.OK;
  }
  if (cliStatus === EXIT.ERR_CLI_ERROR_EXPECT) {
    // expect/ensure failures — passed through
    return EXIT.ERR_CLI_ERROR_EXPECT;
  }
  return EXIT.ERR_CLI_ERROR;
}

async function pipeline(
  cfg: WorkerConfig,
  storage: Storage,
  messageBus: MessageBus
): Promise<void> {
  cfg.cliArgs = decodeCliArgs(cfg.cliArgsEncoded);
  debug(`decoded: ${JSON.stringify(cfg.cliArgs)}`);

  progress(cfg.workerId, `Test run ID = ${cfg.testRunId}`);
  progress(cfg.workerId, 'Syncing test data');
  await fs.mkdir(cfg.testDataDir, { recursive: true });
  console.log(`is_azure: ${cfg.mode === 'azure' ? 'yes' : ''}`);
  await storage.syncTestData(cfg.testDataDir);
  const entries = await fs.readdir(cfg.testDataDir);
  debug(cfg.testDataDir);
  debug(entries.join('\n'));

  if (entries.length === 0) {
    console.log(`${cfg.testDataDir} seems to be empty`);
    throw new WorkerError(EXIT.ERR_TEST_DIR_EMPTY, 'test data dir empty');
  }

  progress(cfg.workerId, 'Installing dependencies');
  await installDependencies(cfg, storage, messageBus);

  progress(cfg.workerId, 'Ready to run');
  await signalReady(cfg, storage, messageBus);

  progress(cfg.workerId, 'Waiting for green signal');
  await waitForObject(
    storage,
    storage.goSignalRef(),
    cfg.testDataDir,
    cfg.waitTimeoutSec
  );

  progress(cfg.workerId, 'Off we go!');
  const exitCode = await runAndReport(cfg, storage, messageBus);
  await finish(exitCode);
}

async function main(): Promise<void> {
  debug(...process.argv.slice(2));

  let parsed: ReturnType<typeof parseWorkerArgs>;
  try {
    parsed = parseWorkerArgs(process.argv.slice(2));
  } catch (err) {
    // Arg validation failures exit without a queue event (the queue
    // URL may be unusable anyway). Bash exited 0 here — fixed.
    if (err instanceof WorkerError) {
      console.error(err.message);
      process.exit(err.code);
    }
    throw err;
  }

  if (parsed.help) {
    console.log(USAGE);
    process.exit(0);
  }

  const cfg = buildConfig(parsed);

  // Azure: validate creds upfront to fail fast if they're invalid
  // (same purpose as the old azure-storage-helper login call).
  let credential: ReturnType<typeof createAzureCredential> | null = null;
  if (cfg.mode === 'azure') {
    try {
      credential = createAzureCredential();
      await azureCredentialCheck(credential);
    } catch (err) {
      console.error(
        `Azure credential check failed: ${(err as Error).message}`
      );
      process.exit(1);
    }
  }

  cfg.workerId = await resolveWorkerId(cfg.mode);
  // Make available to Artillery custom scripts/environment:
  process.env.WORKER_ID = cfg.workerId;

  let storage: Storage;
  if (cfg.mode === 'azure') {
    storage = new AzureBlobStorage({
      containerName: cfg.blobContainerName,
      testRunId: cfg.testRunId,
      credential: credential as ReturnType<typeof createAzureCredential>
    });
    bus = new AqsBus({
      queueName: process.env.AQS_QUEUE_NAME ?? '',
      storageAccount: process.env.AZURE_STORAGE_ACCOUNT ?? '',
      credential: credential as ReturnType<typeof createAzureCredential>,
      testRunId: cfg.testRunId,
      workerId: cfg.workerId
    });
  } else {
    storage = new S3Storage({
      region: cfg.awsRegion,
      testDataPath: cfg.s3TestDataPath,
      runDataPath: cfg.s3RunDataPath
    });
    bus = new SqsBus({
      queueUrl: cfg.queueUrl,
      region: cfg.awsRegion,
      testRunId: cfg.testRunId,
      workerId: cfg.workerId
    });
  }

  progress(cfg.workerId, '============================');
  progress(
    cfg.workerId,
    `Worker starting up, ID = ${cfg.workerId}, version = ${
      process.env.WORKER_VERSION || 'unknown'
    }, leader = ${cfg.isLeaderRaw}`
  );
  progress(cfg.workerId, '============================');

  process.on('SIGTERM', () => void onSignal('SIGTERM'));
  process.on('SIGINT', () => void onSignal('SIGINT'));

  try {
    await pipeline(cfg, storage, bus);
  } catch (err) {
    if (err instanceof WorkerError) {
      // Known failure — the throwing site already printed its log line.
      await finish(err.code);
    } else {
      // Unexpected error -> workerError + exit 6 (bash silently exited
      // 0 and sent workerDone here — fixed, see plan 8:8).
      console.error((err as Error).stack || String(err));
      await finish(EXIT.ERR_CLI_ERROR);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(EXIT.ERR_CLI_ERROR);
});
