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
      legacyReporting: typeof process.env.ARTILLERY_USE_LEGACY_REPORT_FORMAT !== 'undefined',
    },
    metrics: {
      event: async function(msg, opts) {
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
    ext: async function(event) {
      // TODO: Validate events object
      this.extensionEvents.push(event);
    },
    suggestedExitCode: 0,

    log: function(msg, opts) {
      let level;
      if (typeof opts === 'string') {
        level = opts;
      } else {
        level = opts.level || 'info';
      }

      opts.level = level;

      global.artillery.globalEvents.emit('log', msg, opts);
    },

    shutdown: async function() {
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
  createGlobalObject,
}
