import path from 'node:path';

export type WorkerMode = 'aws' | 'azure';

// Exit codes visible in ECS stopped-task info and sent in workerError
// events. ERR_ARGS and ERR_DEP_INSTALL intentionally collide (both 10),
// mirroring the original bash implementation.
export const EXIT = {
  OK: 0,
  ERR_TEST_DIR_EMPTY: 3,
  ERR_SIGNAL_SYNC: 4,
  ERR_GO_TIMEOUT: 5,
  ERR_CLI_ERROR: 6,
  ERR_INTERRUPTED: 7,
  ERR_ARGS: 10,
  ERR_DEP_INSTALL: 10,
  ERR_HEARTBEAT_TIMEOUT: 12,
  ERR_CLI_ERROR_EXPECT: 21
} as const;

// Known failure with a well-defined exit code. Sites that throw this
// print their own (format-preserving) log line first; the top-level
// handler only maps the code and sends the final queue event.
export class WorkerError extends Error {
  code: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = 'WorkerError';
    this.code = code;
  }
}

export interface ParsedWorkerArgs {
  help: boolean;
  isAzure: boolean;
  testDataPath: string; // -p: s3://bucket/tests/<id> (AWS) or blob container name (Azure)
  cliArgsEncoded: string; // -a: base64(JSON array of CLI arg strings)
  region: string; // -r
  queueUrl: string; // -q: SQS queue URL (AWS) or AQS queue URL (Azure)
  testRunId: string; // -i
  runDataBasePath: string; // -d: s3://bucket/test-runs (AWS)
  waitTimeoutSec: number; // -t, falls back to WAIT_TIMEOUT env, then 600
}

export interface WorkerConfig {
  mode: WorkerMode;
  testRunId: string;
  workerId: string; // resolved during startup
  isLeader: boolean;
  isLeaderRaw: string; // printed in the startup banner as-is
  waitTimeoutSec: number;
  testDataDir: string;
  cliArgsEncoded: string;
  cliArgs: string[]; // decoded in the pipeline
  awsRegion: string; // 'NOT_USED_ON_AZURE' on the Azure path
  queueUrl: string;
  s3TestDataPath: string; // s3://bucket/tests/<id>
  s3RunDataPath: string; // s3://bucket/test-runs/<id>
  blobContainerName: string; // Azure only (the -p value)
}

export function buildConfig(
  parsed: ParsedWorkerArgs,
  env: NodeJS.ProcessEnv = process.env
): WorkerConfig {
  const mode: WorkerMode = parsed.isAzure ? 'azure' : 'aws';
  return {
    mode,
    testRunId: parsed.testRunId,
    workerId: '',
    isLeader: (env.IS_LEADER || 'false') === 'true',
    isLeaderRaw: env.IS_LEADER || 'false',
    waitTimeoutSec: parsed.waitTimeoutSec,
    testDataDir: path.join(process.cwd(), 'test_data'),
    cliArgsEncoded: parsed.cliArgsEncoded,
    cliArgs: [],
    awsRegion: parsed.region,
    queueUrl: parsed.queueUrl,
    s3TestDataPath: parsed.testDataPath,
    s3RunDataPath: `${parsed.runDataBasePath}/${parsed.testRunId}`,
    blobContainerName: parsed.testDataPath
  };
}
