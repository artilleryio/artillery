import { createRequire } from 'node:module';
import { updateGlobalObject } from '@artilleryio/int-core';
import { BUILTIN_PACKAGES_DIR } from './builtin-packages.ts';
import createConsoleReporter from './console-reporter.ts';
import * as telemetry from './telemetry.ts';

const require = createRequire(import.meta.url);
const version = require('artillery/package.json').version;

async function createGlobalObject(_opts?) {
  // Lets engine loading in @artilleryio/int-core fall back to the
  // built-in packages bundled with artillery (dist/builtin-packages).
  // Inherited by worker processes via the environment.
  process.env.ARTILLERY_BUILTIN_PACKAGES_DIR =
    process.env.ARTILLERY_BUILTIN_PACKAGES_DIR || BUILTIN_PACKAGES_DIR;

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
    (
    async () => {
      // TODO: Move graceful shutdown logic into here
      process.exit(global.artillery.suggestedExitCode);
    });
}

export { createGlobalObject };