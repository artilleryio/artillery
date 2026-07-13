import { EventEmitter } from 'node:events';
import { engine_util } from '@artilleryio/int-commons';
import chalk from 'chalk';
import { SSMS } from './ssms.ts';

// NOTE: This may be called more than once, and so should be non-destructive
async function updateGlobalObject(opts: any = {}) {
  global.artillery = global.artillery || {};

  global.artillery.runtimeOptions = global.artillery.runtimeOptions || {};
  global.artillery.runtimeOptions.extendedHTTPMetrics =
    typeof process.env.ARTILLERY_EXTENDED_HTTP_METRICS !== 'undefined';

  global.artillery.metrics = global.artillery.metrics || {};
  global.artillery.metrics.event = async (msg, opts) => {
    if (opts.level === 'error') {
      console.log((chalk as any).red(msg));
    } else {
      console.log(msg);
    }
  };

  global.artillery.util = global.artillery.util || {};

  global.artillery.util.template = engine_util.template;

  global.artillery.plugins = global.artillery.plugins || [];

  global.artillery.extensionEvents = global.artillery.extensionEvents || [];

  global.artillery.ext =
    global.artillery.ext ||
    async function (event) {
      // TODO: Validate events object
      this.extensionEvents.push(event);
    };

  if (!Object.hasOwn(global.artillery, 'globalEvents')) {
    Object.defineProperty(global.artillery, 'globalEvents', {
      value: new EventEmitter()
    });
  }

  global.artillery.__SSMS = SSMS;

  if (!Object.hasOwn(global.artillery, 'suggestedExitCode')) {
    Object.defineProperty(global.artillery, 'suggestedExitCode', {
      get() {
        return global.artillery._exitCode;
      },
      set(code) {
        global.artillery._exitCode = code;
        if (typeof global.artillery._workerThreadSend === 'function') {
          global.artillery._workerThreadSend({
            event: 'setSuggestedExitCode',
            code: code
          });
        }
      }
    });
  }

  global.artillery.logger =
    global.artillery.logger ||
    ((opts) => ({
      log: (...args) => {
        global.artillery.globalEvents.emit('log', opts, ...args);
      }
    }));

  global.artillery.log =
    global.artillery.log ||
    ((...args) => {
      global.artillery.globalEvents.emit('log', {}, ...args);
    });

  if (opts.version) {
    global.artillery.version = opts.version;
  }
  if (opts.telemetry) {
    global.artillery.telemetry = opts.telemetry;
  }
}

async function main() {
  await updateGlobalObject();
}

main();

export { updateGlobalObject };
