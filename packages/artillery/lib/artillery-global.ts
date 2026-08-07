import { createRequire } from 'node:module';
import createConsoleReporter from './console-reporter.ts';
import { updateGlobalObject } from './core/index.ts';
import * as telemetry from './telemetry.ts';

const require = createRequire(import.meta.url);
const version = require('artillery/package.json').version;

async function createGlobalObject(_opts?: unknown) {
  await updateGlobalObject({
    version,
    telemetry
  });

  global.artillery.runtimeOptions = global.artillery.runtimeOptions || {};
  global.artillery.runtimeOptions.legacyReporting =
    typeof process.env.ARTILLERY_USE_LEGACY_REPORT_FORMAT !== 'undefined';
  global.artillery._workerThreadSend =
    global.artillery._workerThreadSend || null;

  global.artillery.__createReporter = createConsoleReporter;

  global.artillery._exitCode = 0;

  global.artillery.shutdown =
    global.artillery.shutdown ||
    (async () => {
      // TODO: Move graceful shutdown logic into here
      process.exit(global.artillery.suggestedExitCode);
    });
}

export { createGlobalObject };
