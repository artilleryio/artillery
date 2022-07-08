/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const divideWork = require('./dist');
const { SSMS } = require('../core/lib/ssms');
const { loadPlugins, loadPluginsConfig } = require('./load-plugins');

const EventEmitter = require('eventemitter3');
const debug = require('debug')('core');

const os = require('os');
const p = require('util').promisify;
const _ = require('lodash');

const PlatformLocal = require('./platform/local');
const PlatformLambda = require('./platform/aws-lambda');

async function createLauncher(script, payload, opts, launcherOpts) {
  launcherOpts = launcherOpts || {
    platform: 'local',
    mode: 'distribute',
  };
  return new Launcher(script, payload, opts, launcherOpts);
}
class Launcher {
  constructor(script, payload, opts, launcherOpts) {
    this.script = script;
    this.payload = payload;
    this.opts = opts;

    this.workers = {};
    this.workerMessageBuffer = [];

    this.metricsByPeriod = {}; // individual intermediates by worker
    this.mergedPeriodMetrics = []; // merged intermediates for a period
    this.finalReportsByWorker = {};

    this.events = new EventEmitter();

    this.pluginEvents = new EventEmitter();
    this.pluginEventsLegacy = new EventEmitter();

    this.launcherOpts = launcherOpts;

    this.periodsReportedFor = [];

    if (launcherOpts.platform === 'local') {
      this.count = this.opts.count || Math.max(1, os.cpus().length - 1);
      debug('Worker thread count:', this.count);
    }

    if (launcherOpts.platform === 'local') {
      this.platform = new PlatformLocal(script, payload, opts);
    } else { // aws:lambda
      this.platform = new PlatformLambda(script, payload, opts, launcherOpts);
    }

    if (launcherOpts.mode === 'distribute') {
      this.workerScripts = divideWork(this.script, this.count);
      this.count = this.workerScripts.length;
    } else {

      this.count = this.launcherOpts.count;
      this.workerScripts = new Array(this.count).fill().map(_ => this.script);
    }

    this.phaseStartedEventsSeen = {};
    this.phaseCompletedEventsSeen = {};

    this.eventsByWorker = {};

    return this;
  }

  async initWorkerEvents(workerEvents) {
    workerEvents.on('workerError', (workerId, message) => {
      const { id, error, level, aggregatable } = message;
      if (aggregatable) {
        this.workerMessageBuffer.push(message);
      } else {
        global.artillery.log(`[${id}]: ${error.message}`, level);
      }
    });

    workerEvents.on('phaseStarted', (workerId, message) => {
      // Note - we send only the first event for a phase, not all of them
      if (
        typeof this.phaseStartedEventsSeen[message.phase.index] === 'undefined'
      ) {
        this.phaseStartedEventsSeen[message.phase.index] = Date.now();
        this.events.emit('phaseStarted', message.phase);
        this.pluginEvents.emit('phaseStarted', message.phase);
      }
    });

    workerEvents.on('phaseCompleted', (workerId, message) => {
      if (
        typeof this.phaseCompletedEventsSeen[message.phase.index] ===
        'undefined'
      ) {
        this.phaseCompletedEventsSeen[message.phase.index] = Date.now();
        this.events.emit('phaseCompleted', message.phase);
        this.pluginEvents.emit('phaseCompleted', message.phase);
      }
    });

    // We are not going to receive stats events from workers
    // which have zero arrivals for a phase. (This can only happen
    // in "distribute" mode.)
    workerEvents.on('stats', (workerId, message) => {
      const workerStats = SSMS.deserializeMetrics(message.stats);
      const period = workerStats.period;
      if (typeof this.metricsByPeriod[period] === 'undefined') {
        this.metricsByPeriod[period] = [];
      }
      // TODO: might want the full message here, with worker ID etc
      this.metricsByPeriod[period].push(workerStats);
    });

    workerEvents.on('done', async (workerId, message) => {
      this.workers[workerId].state = 'exited'; // TODO:

      this.finalReportsByWorker[workerId] = SSMS.deserializeMetrics(
        message.report
      );

      if (Object.keys(this.finalReportsByWorker).length === this.count) {
        // Flush messages from workers
        await this.flushWorkerMessages(0);
        await this.flushIntermediateMetrics(true);

        // TODO: handle worker death

        const pds = Object.keys(this.finalReportsByWorker).map(
          (k) => this.finalReportsByWorker[k]
        );

        const statsByPeriod = Object.values(SSMS.mergeBuckets(pds));
        const stats = SSMS.pack(statsByPeriod);

        stats.summaries = {};
        for (const [name, value] of Object.entries(stats.histograms || {})) {
          const summary = SSMS.summarizeHistogram(value);
          stats.summaries[name] = summary;
        }

        // Relay event to workers
        this.pluginEvents.emit('done', stats);
        this.pluginEventsLegacy.emit('done', SSMS.legacyReport(stats));

        this.events.emit('done', stats);
      }
    });

    workerEvents.on('log', async (workerId, message) => {
      artillery.globalEvents.emit('log', ...message.args);
    });

    workerEvents.on('setSuggestedExitCode', (workerId, message) => {
      artillery.suggestedExitCode = message.code;
    });
  }

  async initPlugins() {
    const plugins = await loadPlugins(
      this.script.config.plugins,
      this.script,
      this.opts
    );

    //
    // init plugins
    //
    for (const [name, result] of Object.entries(plugins)) {
      if (result.isLoaded) {
        if (result.version === 3) {
          // TODO: load the plugin, subscribe to events
          // global.artillery.plugins[name] = result.plugin;
        } else {
          //           global.artillery.log(`WARNING: Legacy plugin detected: ${name}
          // See https://artillery.io/docs/resources/core/v2.html for more details.`,
          //                                'warn');

          // NOTE:
          // We are giving v1 and v2 plugins a throw-away script
          // object because we only care about the plugin setting
          // up event handlers here. The plugins will be loaded
          // properly in individual workers where they will have the
          // opportunity to attach custom code, modify the script
          // object etc.
          // If we let a plugin access to the actual script object,
          // and it happens to attach code to it (with a custom
          // processor function for example) - spawning a worker
          // will fail.
          const dummyScript = JSON.parse(JSON.stringify(this.script));
          dummyScript.config = {
            ...dummyScript.config,
            // Load additional plugins configuration from the environment
            plugins: loadPluginsConfig(this.script.config.plugins)
          };

          if (result.version === 1) {
            result.plugin = new result.PluginExport(
              dummyScript.config,
              this.pluginEventsLegacy
            );
            global.artillery.plugins.push(result);
          } else if (result.version === 2) {
            if (result.PluginExport.LEGACY_METRICS_FORMAT === false) {
              result.plugin = new result.PluginExport.Plugin(
                dummyScript,
                this.pluginEvents,
                this.opts
              );
            } else {
              result.plugin = new result.PluginExport.Plugin(
                dummyScript,
                this.pluginEventsLegacy,
                this.opts
              );
            }
            global.artillery.plugins.push(result);
          } else {
            // TODO: print warning
          }
        }
      } else {
        global.artillery.log(`WARNING: Could not load plugin: ${name}`, 'warn');
        global.artillery.log(result.msg, 'warn');
        // global.artillery.log(result.error, 'warn');
      }
    }
  }

  async flushWorkerMessages(maxAge = 9000) {
    // Collect messages older than maxAge msec and group by log message:
    const now = Date.now();
    const okToPrint = this.workerMessageBuffer.filter(
      (m) => now - m.ts > maxAge
    );
    this.workerMessageBuffer = this.workerMessageBuffer.filter(
      (m) => now - m.ts <= maxAge
    );

    const readyMessages = okToPrint.reduce((acc, message) => {
      const { error } = message;
      // TODO: Take event type and level into account
      if (typeof acc[error.message] === 'undefined') {
        acc[error.message] = [];
      }
      acc[error.message].push(message);
      return acc;
    }, {});

    for (const [logMessage, messageObjects] of Object.entries(readyMessages)) {
      if (messageObjects[0].error) {
        global.artillery.log(
          `[${messageObjects[0].id}] ${messageObjects[0].error.message}`,
          messageObjects[0].level
        );
      } else {
        // Expect a msg property:
        global.artillery.log(
          `[${messageObjects[0].id}] ${messageObjects[0].msg}`,
          messageObjects[0].level
        );
      }
    }
  }

  async flushIntermediateMetrics(flushAll = false) {
    // NOTE: We simply print everything we have for a reporting window
    // older than 20 seconds. We aren't concerned with making sure that
    // we have metrics objects from each running/non-idle worker.
    for (const [period, metricObjects] of Object.entries(
      this.metricsByPeriod
    )) {
      const now = flushAll ? Date.now() * 10 : Date.now();
      if (now - Number(period) > 20000) {
        const stats = SSMS.mergeBuckets(this.metricsByPeriod[period])[
          String(period)
        ];
        // summarize histograms for console reporter
        stats.summaries = {};
        for (const [name, value] of Object.entries(stats.histograms || {})) {
          const summary = SSMS.summarizeHistogram(value);
          stats.summaries[name] = summary;
        }

        // Relay event to workers
        this.pluginEvents.emit('stats', stats);
        this.pluginEventsLegacy.emit('stats', SSMS.legacyReport(stats));

        this.events.emit('stats', stats);

        delete this.metricsByPeriod[period];
      }
    }
  }

  async run() {
    await this.initPlugins();

    setInterval(async () => {
      await this.flushWorkerMessages();
    }, 1 * 1000).unref();

    setInterval(async () => {
      this.flushIntermediateMetrics();
    }, 5 * 1000).unref();


    const contextVars = await this.platform.init();

    // TODO: only makes sense for "distribute" / "local"
    for (const script of this.workerScripts) {
      const w1 = await this.platform.createWorker();

      this.workers[w1.workerId] = {
        id: w1.workerId,
        script
      };
      debug(`worker init ok: ${w1.workerId}`);
    }

    await this.initWorkerEvents(this.platform.events);

    const prepareAll = [];
    const runAll = [];

    for (const [workerId, w] of Object.entries(this.workers)) {
      await this.platform.prepareWorker(workerId, {
            script: w.script,
            payload: this.payload,
            options: this.opts
          });
    }
    debug('workers prepared');

    // the initial context is stringified and copied to the workers
    const contextVarsString = JSON.stringify(contextVars);

    artillery.log('Running scenarios...');
    for (const [workerId, w] of Object.entries(this.workers)) {
      await this.platform.runWorker(workerId, contextVarsString);
    }

    debug('workers running');
  }

  async shutdown() {
    await this.platform.shutdown();

    // TODO: flush worker messages, and intermediate stats

    // Unload plugins
    // TODO: v3 plugins
    if (global.artillery && global.artillery.plugins) {
      for (const o of global.artillery.plugins) {
        if (o.plugin.cleanup) {
          try {
            await p(o.plugin.cleanup.bind(o.plugin))();
            debug('plugin unloaded:', o.name);
          } catch (cleanupErr) {
            global.artillery.log(cleanupErr, 'error');
          }
        }
      }
    }

    // Stop workers
    for (const [id, w] of Object.entries(this.workers)) {
      await this.platform.stopWorker(id);
    }
  }
}

module.exports = createLauncher;
