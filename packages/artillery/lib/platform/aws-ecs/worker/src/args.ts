import { parseArgs } from 'node:util';
import { EXIT, type ParsedWorkerArgs, WorkerError } from './config.ts';

export const USAGE = 'usage: loadgen-worker - run worker';

// Same flags as the bash getopts spec: z:p:a:r:q:i:d:t:h?
export function parseWorkerArgs(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env
): ParsedWorkerArgs {
  let values: Record<string, string | boolean | undefined>;
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: argv,
      options: {
        azure: { type: 'string', short: 'z' },
        'test-data-path': { type: 'string', short: 'p' },
        'cli-args': { type: 'string', short: 'a' },
        region: { type: 'string', short: 'r' },
        'queue-url': { type: 'string', short: 'q' },
        'test-run-id': { type: 'string', short: 'i' },
        'run-data-base-path': { type: 'string', short: 'd' },
        'wait-timeout': { type: 'string', short: 't' },
        help: { type: 'boolean', short: 'h' }
      },
      allowPositionals: true,
      strict: true
    }));
  } catch (_err) {
    throw new WorkerError(EXIT.ERR_ARGS, USAGE);
  }

  if (values.help) {
    return {
      help: true,
      isAzure: false,
      testDataPath: '',
      cliArgsEncoded: '',
      region: '',
      queueUrl: '',
      testRunId: '',
      runDataBasePath: '',
      waitTimeoutSec: 600
    };
  }

  if (positionals.length > 0) {
    throw new WorkerError(EXIT.ERR_ARGS, USAGE);
  }

  const testDataPath = values['test-data-path'] as string | undefined;
  const cliArgsEncoded = values['cli-args'] as string | undefined;
  const testRunId = values['test-run-id'] as string | undefined;
  if (!testDataPath || !cliArgsEncoded || !testRunId) {
    throw new WorkerError(
      EXIT.ERR_ARGS,
      'Some required argument(s) not provided, aborting'
    );
  }

  let waitTimeoutSec = Number.parseInt(env.WAIT_TIMEOUT ?? '', 10);
  if (Number.isNaN(waitTimeoutSec)) {
    waitTimeoutSec = 600;
  }
  if (typeof values['wait-timeout'] === 'string') {
    const t = Number.parseInt(values['wait-timeout'], 10);
    if (!Number.isNaN(t)) {
      waitTimeoutSec = t;
    }
  }

  return {
    help: false,
    isAzure: values.azure === 'yes',
    testDataPath,
    cliArgsEncoded,
    region: (values.region as string) ?? '',
    queueUrl: (values['queue-url'] as string) ?? '',
    testRunId,
    runDataBasePath: (values['run-data-base-path'] as string) ?? '',
    waitTimeoutSec
  };
}

// -a value: base64(JSON.stringify(string[]))
export function decodeCliArgs(encoded: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  } catch (err) {
    throw new WorkerError(
      EXIT.ERR_ARGS,
      `Could not decode CLI args: ${(err as Error).message}`
    );
  }
  if (
    !Array.isArray(parsed) ||
    !parsed.every((x) => typeof x === 'string')
  ) {
    throw new WorkerError(
      EXIT.ERR_ARGS,
      'Decoded CLI args are not an array of strings'
    );
  }
  return parsed;
}
