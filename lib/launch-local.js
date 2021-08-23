/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const divideWork = require('./dist');
const { SSMS, normalizeTs } = require('../core/lib/ssms');
const { loadPlugins } = require('./load-plugins');
const awaitOnEE = require('./util/await-on-ee');
const sleep = require('./util/sleep');
const EventEmitter = require('eventemitter3');
const debug = require('debug')('core');

const { Worker } = require('worker_threads');
const path = require('path');
const os = require('os');
const p = require('util').promisify;

async function createRunner(script, payload, opts) {
  return new Launcher(script, payload, opts);
}

class Launcher {
  constructor (script, payload, opts) {
    this.script = script;
    this.payload = payload;
    this.opts = opts;

    // NOTE: Local launcher works only in "distribute" mode; there's
    // no "multiply"
    this.count = this.opts.count || Math.max(1, os.cpus().length - 1);

    this.workers = {};
    this.workerMessageBuffer = [];

    this.metricsByPeriod = {};
    this.finalReportsByWorker = {};

    this.events = new EventEmitter();

    this.pluginEvents = new EventEmitter();
    this.pluginEventsLegacy = new EventEmitter();

    this.workerScripts = divideWork(this.script, this.count);
    this.count = this.workerScripts.length;

    this.phaseStartedEventsSeen = {};
    this.phaseCompletedEventsSeen = {};

    // this.eventBus = new EventEmitter();

    this.eventsByWorker = {};

    return this;
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
          // properly in individual workers where they will the
          // opportunity to attach custom code, modify the script
          // object etc.
          // If we let a plugin access to the actual script object,
          // and it happens to attach code to it (with a custom
          // processor function for example) - spawning a worker
          // will fail.
          const dummyScript = JSON.parse(JSON.stringify(this.script));
          if (result.version === 1) {
            result.plugin = new result.PluginExport(dummyScript.config, this.pluginEventsLegacy);
            global.artillery.plugins.push(result);
          } else if (result.version === 2) {
            result.plugin = new result.PluginExport.Plugin(dummyScript, this.pluginEventsLegacy, this.opts);
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
    const okToPrint = this.workerMessageBuffer.filter(m => now - m.ts > maxAge);
    this.workerMessageBuffer = this.workerMessageBuffer.filter(m => now - m.ts <= maxAge);

    const readyMessages = okToPrint.reduce((acc, message) => {
      const { error } = message;
      // TODO: Take event type and level into account
      if (typeof acc[error.message] === 'undefined') {
        acc[error.message] = [];
      }
      acc[error.message].push(message);
      return acc;
    }, {});

    for(const [ logMessage, messageObjects ] of Object.entries(readyMessages)) {
      if (messageObjects[0].error) {
        global.artillery.log(`[${messageObjects[0].id}] ${messageObjects[0].error.message}`, messageObjects[0].level);
      } else {
        // Expect a msg property:
        global.artillery.log(`[${messageObjects[0].id}] ${messageObjects[0].msg}`, messageObjects[0].level);
      }
    }
  }

  async flushIntermediateMetrics(flushAll = false) {
    // NOTE: We simply print everything we have for a reporting window
    // older than 20 seconds. We aren't concerned with making sure that
    // we have metrics objects from each running/non-idle worker.
    for (const [period, metricObjects] of Object.entries(this.metricsByPeriod)) {
      const now = flushAll ? Date.now() * 10 : Date.now();
      if (now - Number(period) > 20000) {
        const stats = SSMS.mergeBuckets(this.metricsByPeriod[period])[String(period)];
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
    }, 900).unref();

    for(const script of this.workerScripts) {
      const w1 = new ArtilleryWorker();
      await w1.init();
      this.workers[w1.workerId] = {
        id: w1.workerId,
        proc: w1,
        state: w1.state,
        script,
      };

      w1.events.on('workerError', (message) => {
        const { id, error, level, aggregatable } = message;
        if (aggregatable) {
          this.workerMessageBuffer.push(message);
        } else {
          global.artillery.log(`[${id}]: ${error.message}`, level);
        }
      });

      // TODO: We might want to expose workerPhaseStarted/Completed events

      w1.events.on('phaseStarted', (message) => {
        // Note - we send only the first event for a phase, not all of them
        if(typeof this.phaseStartedEventsSeen[message.phase.index] === 'undefined') {
          this.phaseStartedEventsSeen[message.phase.index] = Date.now();
          this.events.emit('phaseStarted', message.phase);
          this.pluginEvents.emit('phaseStarted', message.phase);
        }
      });

      w1.events.on('phaseCompleted', (message) => {
        if(typeof this.phaseCompletedEventsSeen[message.phase.index] === 'undefined') {
          this.phaseCompletedEventsSeen[message.phase.index] = Date.now();
          this.events.emit('phaseCompleted', message.phase);
          this.pluginEvents.emit('phaseCompleted', message.phase);
        }
      });

      // We are not going to receive stats events from workers
      // which have zero arrivals for a phase. (This can only happen
      // in "distribute" mode.)
      w1.events.on('stats', (message) => {
        const workerStats = SSMS.deserializeMetrics((message.stats));
        const period = workerStats.period;
        if (typeof this.metricsByPeriod[period] ==='undefined') {
          this.metricsByPeriod[period] = [];
        }
        // TODO: might want the full message here, with worker ID etc
        this.metricsByPeriod[period].push(workerStats);
      });

      w1.events.on('done', async (message) => {
        this.workers[message.id].state = 'exited'; // TODO:

        this.finalReportsByWorker[message.id] = SSMS.deserializeMetrics(message.report);

        if(Object.keys(this.finalReportsByWorker).length === this.count) {
          // Flush messages from workers
          await this.flushWorkerMessages(0);
          await this.flushIntermediateMetrics(true);

          // TODO: handle worker death

          const pds = Object.keys(this.finalReportsByWorker).map(k => this.finalReportsByWorker[k]);
          const period = pds[0].period; // same for all
          const stats = SSMS.mergeBuckets(pds)[String(period)];

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

      debug(`worker init ok: ${w1.workerId} - state: ${w1.state}`);
    }

    const prepareAll = [];
    const runAll = [];
    for (const [workerId, w] of Object.entries(this.workers)) {
      prepareAll.push(w.proc.prepare({
        script: w.script,
        payload: this.payload,
        options: this.opts
      }));
    }
    await Promise.all(prepareAll);
    debug('workers prepared');

    for (const [workerId, w] of Object.entries(this.workers)) {
      runAll.push(w.proc.run());
    }
    await Promise.all(runAll);
    debug('workers running');
  }

  async shutdown() {
    // TODO: flush worker messages, and intermediate stats

    // Unload plugins
    // TODO: v3 plugins
    if (global.artillery && global.artillery.plugins) {
      for (const o of global.artillery.plugins) {
        if(o.plugin.cleanup) {
          try {
            await p(o.plugin.cleanup.bind(o.plugin))();
            debug('plugin unloaded:', o.name);
          } catch(cleanupErr) {
            global.artillery.log(cleanupErr, 'error');
          }
        }
      }
    }

    // Stop workers
    for(const [id, w] of Object.entries(this.workers)) {
      w.proc.stop();
    }
  }
}

const STATES = {
  initializing: 1,
  online: 2,
  preparing: 3,
  readyWaiting: 4,
  running: 5,
  unknown: 6,
  stoppedError: 7,
  completed: 8,
  stoppedEarly: 9,
  stoppedFailed: 10,
  timedout: 11,
};

class ArtilleryWorker {
  constructor(opts) {
    this.opts = opts;
    this.events = new EventEmitter(); // events for consumers of this object
    this.workerEvents = new EventEmitter(); // turn events delivered via 'message' events into their own messages
  }

  async init(_opts) {
    this.state = STATES.initializing;

    this.worker = new Worker(path.join(__dirname, 'worker.js'));
    this.workerId = this.worker.threadId;
    this.worker.on('error', this.onError.bind(this));
    // TODO:
    this.worker.on('exit', (exitCode) => {
      this.events.emit('exit', exitCode);
    });
    this.worker.on('messageerror', (err) => {

    });

    // TODO: Expose performance metrics via getHeapSnapshot() and performance object.

    await awaitOnEE(this.worker, 'online', 10);

    // Relay messages onto the real event emitter:
    this.worker.on('message', (message) => {
      switch(message.event) {
      case 'workerError':
        this.events.emit('workerError', message);
        this.workerEvents.emit('workerError', message);
        break;
      case 'phaseStarted':
        this.events.emit('phaseStarted', message);
        this.workerEvents.emit('phaseStarted', message);
        break;
      case 'phaseCompleted':
        this.events.emit('phaseCompleted', message);
        this.workerEvents.emit('phaseCompleted', message);
        break;
      case 'stats':
        this.events.emit('stats', message);
        this.workerEvents.emit('stats', message);
        break;
      case 'done':
        this.events.emit('done', message);
        this.workerEvents.emit('done', message);
        break;
      case 'running':
        this.events.emit('running', message);
        this.workerEvents.emit('running', message);
        break
      case 'readyWaiting':
        this.events.emit('readyWaiting', message);
        this.workerEvents.emit('readyWaiting', message);
        break;
      default:
        global.artillery.log(`Unknown message from worker ${message}`, 'error');
      }
    });

    this.state = STATES.online;
  }

  async prepare(opts) {
    this.state = STATES.preparing;

    const { script, payload, options } = opts;
    this.worker.postMessage({
      command: 'prepare',
      opts: { script, payload, options }
    });

    await awaitOnEE(this.workerEvents, 'readyWaiting', 50);
    this.state = STATES.readyWaiting;
  }

  async run(opts) {
    this.worker.postMessage({
      command: 'run',
      opts,
    });

    await awaitOnEE(this.workerEvents, 'running', 50);
    this.state = STATES.running;
  }

  async stop() {
    this.worker.postMessage({ command: 'stop' });
  }

  onError(err) {
    // TODO: set state, clean up
    this.events.emit('error', err);
    console.log('worker error, id:', this.workerId, err);
  }
}

module.exports = createRunner;
