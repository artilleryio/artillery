/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const divideWork = require('./dist');
const { SSMS } = require('@artilleryio/int-core').ssms;
const { loadPlugins, loadPluginsConfig } = require('./load-plugins');

const EventEmitter = require('eventemitter3');
const debug = require('debug')('core');

const os = require('os');
const p = require('util').promisify;
const _ = require('lodash');

const PlatformLocal = require('./platform/local');
const PlatformLambda = require('./platform/aws-lambda');
const STATES = require('./platform/worker-states');

async function createLauncher(script, payload, opts, launcherOpts) {
  launcherOpts = launcherOpts || {
    platform: 'local',
    mode: 'distribute'
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
    } else {
      // aws:lambda
      this.platform = new PlatformLambda(script, payload, opts, launcherOpts);
    }

    if (launcherOpts.mode === 'distribute') {
      this.workerScripts = divideWork(this.script, this.count);
      this.count = this.workerScripts.length;
    } else {
      this.count = this.launcherOpts.count;
      this.workerScripts = new Array(this.count).fill().map((_) => this.script);
    }

    this.phaseStartedEventsSeen = {};
    this.phaseCompletedEventsSeen = {};

    this.eventsByWorker = {};

    return this;
  }

  async initWorkerEvents(workerEvents) {
    workerEvents.on('workerError', (workerId, message) => {
      this.workers[workerId].state = STATES.stoppedError;

      const { id, error, level, aggregatable, logs } = message;
      if (aggregatable) {
        this.workerMessageBuffer.push(message);
      } else {
        global.artillery.log(`[${id}]: ${error.message}`);
        if (logs) {
          global.artillery.log(logs);
        }
      }

      this.events.emit('workerError', message);
    });

    workerEvents.on('phaseStarted', (workerId, message) => {
      // Note - we send only the first event for a phase, not all of them
      if (
        typeof this.phaseStartedEventsSeen[message.phase.index] === 'undefined'
      ) {
        this.phaseStartedEventsSeen[message.phase.index] = Date.now();
        this.events.emit('phaseStarted', message.phase);
        this.pluginEvents.emit('phaseStarted', message.phase);
        this.pluginEventsLegacy.emit('phaseStarted', message.phase);
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
        this.pluginEventsLegacy.emit('phaseCompleted', message.phase);
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
      this.workers[workerId].state = STATES.completed;

      this.finalReportsByWorker[workerId] = SSMS.deserializeMetrics(
        message.report
      );
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

  async handleAllWorkersFinished() {
    const allWorkersDone =
      Object.keys(this.workers).filter((workerId) => {
        return (
          this.workers[workerId].state === STATES.completed ||
          this.workers[workerId].state === STATES.stoppedError
        );
      }).length === this.count;

    if (allWorkersDone) {
      clearInterval(this.i1);
      clearInterval(this.i2);

      // Flush messages from workers
      await this.flushWorkerMessages(0);
      await this.flushIntermediateMetrics(true);

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

      clearInterval(this.workerExitWatcher);

      // Relay event to workers
      this.pluginEvents.emit('done', stats);

      global.artillery.globalEvents.emit('done', stats);
      this.pluginEventsLegacy.emit('done', SSMS.legacyReport(stats));

      this.events.emit('done', stats);
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
    if (Object.keys(this.metricsByPeriod).length === 0) {
      debug('No metrics received yet');
      return;
    }

    // We always look at the earliest period available so that reports come in chronological order
    const earliestPeriodAvailable = Object.keys(this.metricsByPeriod)
      .filter((x) => this.periodsReportedFor.indexOf(x) === -1)
      .sort()[0];

    // TODO: better name. One above is earliestNotAlreadyReported
    const earliest = Object.keys(this.metricsByPeriod).sort()[0];
    if (this.periodsReportedFor.indexOf(earliest) > -1) {
      global.artillery.log(
        'Warning: multiple batches of metrics for period',
        earliest,
        new Date(Number(earliest))
      );

      delete this.metricsByPeriod[earliest]; // FIXME: need to merge them in for the final report
    }

    // Dynamically adjust the duration we're willing to wait for. This matters on SQS where messages are received
    // in batches of 10 and more workers => need to wait longer.
    const MAX_WAIT_FOR_PERIOD_MS = (Math.ceil(this.count / 10) * 3 + 30) * 1000;

    debug({
      now: Date.now(),
      count: this.count,
      earliestPeriodAvailable,
      earliest,
      MAX_WAIT_FOR_PERIOD_MS,
      numReports: this.metricsByPeriod[earliestPeriodAvailable]?.length,
      periodsReportedFor: this.periodsReportedFor,
      metricsByPeriod: Object.keys(this.metricsByPeriod)
    });

    const allWorkersReportedForPeriod =
      this.metricsByPeriod[earliestPeriodAvailable]?.length === this.count;
    const waitedLongEnough =
      Date.now() - Number(earliestPeriodAvailable) > MAX_WAIT_FOR_PERIOD_MS;
    if (
      typeof earliestPeriodAvailable !== 'undefined' &&
      (flushAll || allWorkersReportedForPeriod || waitedLongEnough)
    ) {
      // TODO: autoscaling. Handle workers that drop off or join, and update count

      if (flushAll) {
        debug('flushAll', earliestPeriodAvailable);
      } else {
        if (allWorkersReportedForPeriod) {
          debug(
            'Got metrics from all workers for period',
            earliestPeriodAvailable
          );
        }
        if (waitedLongEnough) {
          debug('MAX_WAIT_FOR_PERIOD reached', earliestPeriodAvailable);
        }
      }

      debug(
        'Report @',
        new Date(Number(earliestPeriodAvailable)),
        'made up of items:',
        this.metricsByPeriod[String(earliestPeriodAvailable)].length
      );

      // TODO: Track how many workers provided metrics in the metrics report
      const stats = SSMS.mergeBuckets(
        this.metricsByPeriod[String(earliestPeriodAvailable)]
      )[String(earliestPeriodAvailable)];
      this.mergedPeriodMetrics.push(stats);
      // summarize histograms for console reporter
      stats.summaries = {};
      for (const [name, value] of Object.entries(stats.histograms || {})) {
        const summary = SSMS.summarizeHistogram(value);
        stats.summaries[name] = summary;
        delete this.metricsByPeriod[String(earliestPeriodAvailable)];
      }

      this.periodsReportedFor.push(earliestPeriodAvailable);

      debug('Emitting stats event');

      this.pluginEvents.emit('stats', stats);
      global.artillery.globalEvents.emit('stats', stats);
      this.pluginEventsLegacy.emit('stats', SSMS.legacyReport(stats));

      this.events.emit('stats', stats);
    } else {
      debug('Waiting for more workerStats before emitting stats event');
    }
  }

  async run() {
    await this.initPlugins();

    this.i1 = setInterval(async () => {
      await this.flushWorkerMessages();
    }, 1 * 1000).unref();

    this.i2 = setInterval(async () => {
      this.flushIntermediateMetrics();
    }, 2 * 1000).unref();

    this.workerExitWatcher = setInterval(async () => {
      await this.handleAllWorkersFinished();
    }, 2 * 1000);

    const contextVars = await this.platform.init();

    // TODO: only makes sense for "distribute" / "local"
    for (const script of this.workerScripts) {
      const w1 = await this.platform.createWorker();

      this.workers[w1.workerId] = {
        id: w1.workerId,
        script,
        state: STATES.initializing
      };
      debug(`worker init ok: ${w1.workerId}`);
    }

    await this.initWorkerEvents(this.platform.events);

    for (const [workerId, w] of Object.entries(this.workers)) {
      await this.platform.prepareWorker(workerId, {
        script: w.script,
        payload: this.payload,
        options: this.opts
      });
      this.workers[workerId].state = STATES.preparing;
    }
    debug('workers prepared');

    // the initial context is stringified and copied to the workers
    const contextVarsString = JSON.stringify(contextVars);

    for (const [workerId, w] of Object.entries(this.workers)) {
      await this.platform.runWorker(workerId, contextVarsString);
      this.workers[workerId].state = STATES.initializing;
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
