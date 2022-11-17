const version = require('../package.json').version;

const createReporter = require('./console-reporter');
const util = require('./util');
const telemetry = require('./telemetry').init();

const { updateGlobalObject } = require('core');

async function createGlobalObject(opts) {
  global.artillery = global.artillery || {};
  global.artillery.version = version;
  global.artillery.runtimeOptions = global.artillery.runtimeOptions || {};
  global.artillery.runtimeOptions.legacyReporting =
    typeof process.env.ARTILLERY_USE_LEGACY_REPORT_FORMAT !== 'undefined';
  global.artillery._workerThreadSend = global.artillery._workerThreadSend || null;

  global.artillery._exitCode = 0;

  global.artillery.telemetry = global.artillery.telemetry || telemetry;

  global.artillery.logger = global.artillery.logger || function (opts) {
    return {
      log: (...args) => {
        global.artillery.globalEvents.emit('log', opts, ...args);
      }
    };
  };

  global.artillery.log = global.artillery.log || function (...args) {
    global.artillery.globalEvents.emit('log', {}, ...args);
  };

  global.artillery.shutdown = global.artillery.shutdown || async function () {
    // TODO: Move graceful shutdown logic into here
    process.exit(global.artillery.suggestedExitCode);
  };

  //global.artillery.suggestedExitCode = 99;

  // TODO: Refactor
  global.artillery.__createReporter = createReporter;
  global.artillery.__util = util;

  await updateGlobalObject();
}

module.exports = {
  createGlobalObject
};
