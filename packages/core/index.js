const EventEmitter = require('events');
const chalk = require('chalk');

// NOTE: This may be called more than once, and so should be non-destructive
async function updateGlobalObject(opts) {
  global.artillery = global.artillery || {};

  global.artillery.runtimeOptions = global.artillery.runtimeOptions || {};
  global.artillery.runtimeOptions.extendedHTTPMetrics =
    typeof process.env.ARTILLERY_EXTENDED_HTTP_METRICS !== 'undefined';

  global.artillery.metrics = global.artillery.metrics || {};
  global.artillery.metrics.event = async function (msg, opts) {
    if (opts.level === 'error') {
      console.log(chalk.red(msg));
    } else {
      console.log(msg);
    }
  };

  global.artillery.util = global.artillery.util || {};

  global.artillery.util.template = require('./lib/engine_util').template;

  global.artillery.plugins = global.artillery.plugins || [];

  global.artillery.extensionEvents = global.artillery.extensionEvents || [];

  global.artillery.ext =
    global.artillery.ext ||
    async function (event) {
      // TODO: Validate events object
      this.extensionEvents.push(event);
    };

  global.artillery.globalEvents =
    global.artillery.globalEvents || new EventEmitter();
  global.artillery.__SSMS = require('./lib/ssms').SSMS;

  if (typeof global.artillery.suggestedExitCode === 'undefined') {
    Object.defineProperty(global.artillery, 'suggestedExitCode', {
      get() {
        return global.artillery._exitCode;
      },
      set(code) {
        global.artillery._exitCode = code;
        if (typeof global.artillery._workerThreadSend === 'function') {
          global.artillery._workerThreadSend({ event: 'setSuggestedExitCode', code: code });
        }
      }
    });
  }
}

async function main() {
  await updateGlobalObject();
}

main();

module.exports = {
  runner: require('./lib/runner'),
  engine_util: require('./lib/engine_util'),
  engine_http: require('./lib/engine_http'),
  ssms: require('./lib/ssms'),
  isIdlePhase: require('./lib/is-idle-phase'),
  updateGlobalObject
};
