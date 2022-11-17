const version = require('../package.json').version;
const chalk = require('chalk');

const createReporter = require('./console-reporter');
const util = require('./util');
const { SSMS } = require('../core/lib/ssms');
const EventEmitter = require('events');
const telemetry = require('./telemetry').init();

async function createGlobalObject(opts) {
  if (typeof global.artillery === 'object') {
    return;
  }

  global.artillery = {
    version: version,
    runtimeOptions: {
      legacyReporting:
        typeof process.env.ARTILLERY_USE_LEGACY_REPORT_FORMAT !== 'undefined',
      extendedHTTPMetrics:
        typeof process.env.ARTILLERY_EXTENDED_HTTP_METRICS !== 'undefined'
    },
    metrics: {
      event: async function (msg, opts) {
        if (opts.level === 'error') {
          console.log(chalk.red(msg));
        } else {
          console.log(msg);
        }
      }
    },

    util: {
      template: require('../util').template
    },

    plugins: [],

    extensionEvents: [],
    ext: async function (event) {
      // TODO: Validate events object
      this.extensionEvents.push(event);
    },

    _workerThreadSend: null,
    _exitCode: 0,
    get suggestedExitCode() {
      return this._exitCode;
    },
    set suggestedExitCode(code) {
      this._exitCode = code;
      if (typeof this._workerThreadSend === 'function') {
        this._workerThreadSend({ event: 'setSuggestedExitCode', code: code });
      }
    },

    logger: function (opts) {
      return {
        log: (...args) => {
          global.artillery.globalEvents.emit('log', opts, ...args);
        }
      };
    },

    log: function (...args) {
      global.artillery.globalEvents.emit('log', {}, ...args);
    },

    shutdown: async function () {
      // TODO: Move graceful shutdown logic into here
      process.exit(artillery.suggestedExitCode);
    }
  };

  global.artillery.telemetry = telemetry;
  global.artillery.globalEvents = new EventEmitter();

  // TODO: Refactor
  global.artillery.__createReporter = createReporter;
  global.artillery.__util = util;
  global.artillery.__SSMS = SSMS;
}

module.exports = {
  createGlobalObject
};
