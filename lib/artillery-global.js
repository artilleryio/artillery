const version = require('../package.json').version;
const chalk = require('chalk');

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

    log: function(msg, level) {
      // TODO: Make aware of any spinners which may be active
      if(!level || level === 'info') {
        console.log(msg);
      } else if (level === 'error') {
        console.error(msg);
      } else if (level === 'warn') {
        console.error(msg);
      }
    },

    shutdown: async function() {
      // TODO: Move graceful shutdown logic into here
      process.exit(artillery.suggestedExitCode);
    }
  };
}

module.exports = {
  createGlobalObject,
}
