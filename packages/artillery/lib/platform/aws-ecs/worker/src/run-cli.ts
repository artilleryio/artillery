import path from 'node:path';
import type { WorkerConfig } from './config.ts';
import { debug } from './log.ts';
import { spawnTee, type TeeChild } from './proc.ts';

// Environment for the Artillery CLI child. Mirrors run_a9 from bash.
export function buildCliEnv(cfg: WorkerConfig): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };

  // NODE_PATH already has <testData>/node_modules prepended (install
  // step); required for plugins to be loaded.
  env.DEBUG = process.env.DEBUG || 'debug:mode:off';

  // Legacy plugins live in the compiled output (dist/); the old lib/
  // path is kept for compatibility with older CLI layouts.
  env.ARTILLERY_PLUGIN_PATH = `${
    process.env.ARTILLERY_PLUGIN_PATH ?? ''
  }:/artillery/packages/artillery/dist/lib/platform/aws-ecs/legacy/plugins:/artillery/packages/artillery/lib/platform/aws-ecs/legacy/plugins`;

  env.ARTILLERY_PLUGINS = JSON.stringify({
    'sqs-reporter': { region: cfg.awsRegion },
    'inspect-script': {}
  });
  env.SQS_TAGS = JSON.stringify([
    { key: 'testId', value: cfg.testRunId },
    { key: 'workerId', value: cfg.workerId }
  ]);

  if (cfg.mode === 'azure') {
    env.AZURE_STORAGE_QUEUE_URL = cfg.queueUrl;
  } else {
    env.SQS_QUEUE_URL = cfg.queueUrl;
    env.SQS_REGION = cfg.awsRegion;
  }

  env.ARTILLERY_DISABLE_ENSURE = 'true';

  // max header size 32KB — solves the HPE_HEADER_OVERFLOW error;
  // max old space size 12GB — max allocatable on Fargate.
  const maxOldSpaceSize = process.env.MAX_OLD_SPACE_SIZE || '12288';
  env.NODE_OPTIONS = `--max-http-header-size=32768 --max-old-space-size=${maxOldSpaceSize} ${
    process.env.NODE_OPTIONS ?? ''
  }`;

  // Available to Artillery custom scripts/environment.
  env.WORKER_ID = cfg.workerId;

  return env;
}

// Spawn the CLI with output teed to <testData>/output.txt. The caller
// owns the child handle (heartbeat kill, signal handling).
export function startCli(cfg: WorkerConfig): TeeChild {
  debug('CLI args:');
  debug(...cfg.cliArgs);

  const bin = process.env.ARTILLERY_BINARY || 'artillery';
  return spawnTee(bin, cfg.cliArgs, {
    cwd: cfg.testDataDir,
    env: buildCliEnv(cfg),
    outputFile: path.join(cfg.testDataDir, 'output.txt')
  });
}
