const version = require('../package.json').version;
const telemetry = require('./telemetry');

const { updateGlobalObject } = require('@artilleryio/int-core');

const { parseScript, readScript } = require('./util');

async function createGlobalObject(opts) {
  await updateGlobalObject({
    version,
    telemetry
  });

  global.artillery.runtimeOptions = global.artillery.runtimeOptions || {};
  global.artillery.runtimeOptions.legacyReporting =
    typeof process.env.ARTILLERY_USE_LEGACY_REPORT_FORMAT !== 'undefined';
  global.artillery._workerThreadSend =
    global.artillery._workerThreadSend || null;

  global.artillery.__createReporter = require('./console-reporter');

  global.artillery._exitCode = 0;

  global.artillery.shutdown =
    global.artillery.shutdown ||
    async function () {
      // TODO: Move graceful shutdown logic into here
      process.exit(global.artillery.suggestedExitCode);
    };
}

module.exports = {
  createGlobalObject
};
