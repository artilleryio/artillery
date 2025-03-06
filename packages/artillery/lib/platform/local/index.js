const { ArtilleryWorker } = require('./artillery-worker-local');
const core = require('../../dispatcher');
const { handleScriptHook, prepareScript, loadProcessor } =
  core.runner.runnerFuncs;
const debug = require('debug')('platform:local');
const EventEmitter = require('events');
const _ = require('lodash');
const divideWork = require('../../dist');
const STATES = require('../worker-states');
const os = require('node:os');
class PlatformLocal {
  constructor(script, payload, opts, platformOpts) {
    // We need these to run before/after hooks:
    this.script = script;
    this.payload = payload;
    this.opts = opts;
    this.events = new EventEmitter(); // send worker events such as workerError, etc
    this.platformOpts = platformOpts;
    this.workers = {};
    this.workerScripts = {};
    this.count = Infinity;
    return this;
  }

  getDesiredWorkerCount() {
    return this.count;
  }

  async startJob() {
    await this.init();

    if (this.platformOpts.mode === 'distribute') {
      // Disable worker threads for Playwright-based load tests
      const count = this.script.config.engines?.playwright
        ? 1
        : Math.max(1, os.cpus().length - 1);
      this.workerScripts = divideWork(this.script, count);
      this.count = this.workerScripts.length;
    } else {
      // --count may only be used when mode is "multiply"
      this.count = this.platformOpts.count;
      this.workerScripts = new Array(this.count).fill().map((_) => this.script);
    }

    for (const script of this.workerScripts) {
      const w1 = await this.createWorker();

      this.workers[w1.workerId] = {
        id: w1.workerId,
        script,
        state: STATES.initializing,
        proc: w1
      };
      debug(`worker init ok: ${w1.workerId}`);
    }

    for (const [workerId, w] of Object.entries(this.workers)) {
      this.opts.cliArgs = this.platformOpts.cliArgs;
      await this.prepareWorker(workerId, {
        script: w.script,
        payload: this.payload,
        options: this.opts
      });
      this.workers[workerId].state = STATES.preparing;
    }
    debug('workers prepared');

    // the initial context is stringified and copied to the workers
    const contextVarsString = JSON.stringify(this.contextVars);

    for (const [workerId, w] of Object.entries(this.workers)) {
      await this.runWorker(workerId, contextVarsString);
      this.workers[workerId].state = STATES.initializing;
    }
  }

  async init() {
    // 'before' hook is executed in the main thread,
    // its context is then passed to the workers
    const contextVars = await this.runHook('before');
    this.contextVars = contextVars; // TODO: Rename to something more descriptive
  }

  async createWorker() {
    const worker = new ArtilleryWorker();

    await worker.init();

    const workerId = worker.workerId;
    worker.events.on('workerError', (message) => {
      this.events.emit('workerError', workerId, message);
    });
    worker.events.on('log', (message) => {
      this.events.emit('log', workerId, message);
    });
    worker.events.on('phaseStarted', (message) => {
      this.events.emit('phaseStarted', workerId, message);
    });
    worker.events.on('phaseCompleted', (message) => {
      this.events.emit('phaseCompleted', workerId, message);
    });
    worker.events.on('stats', (message) => {
      this.events.emit('stats', workerId, message);
    });
    worker.events.on('done', (message) => {
      this.events.emit('done', workerId, message);
    });
    worker.events.on('readyWaiting', (message) => {
      this.events.emit('readyWaiting', workerId, message);
    });
    worker.events.on('setSuggestedExitCode', (message) => {
      this.events.emit('setSuggestedExitCode', workerId, message);
    });
    worker.events.on('exit', (message) => {
      this.events.emit('exit', workerId, message);
    });

    worker.events.on('error', (_err) => {
      // TODO: Only exit if ALL workers fail, otherwise log and carry on
      process.nextTick(() => process.exit(11));
    });

    return worker;
  }

  async prepareWorker(workerId, opts) {
    return this.workers[workerId].proc.prepare(opts);
  }

  async runWorker(workerId, contextVarsString) {
    // TODO: this will become opts
    debug('runWorker', workerId);
    return this.workers[workerId].proc.run(contextVarsString);
  }

  async stopWorker(workerId) {
    return this.workers[workerId].proc.stop();
  }

  async shutdown() {
    // 'after' hook is executed in the main thread, after all workers
    // are done
    await this.runHook('after', this.contextVars);

    for (const [workerId, w] of Object.entries(this.workers)) {
      await this.stopWorker(workerId);
    }
  }

  // ********

  async runHook(hook, initialContextVars) {
    if (!this.script[hook]) {
      return {};
    }

    const runnableScript = await loadProcessor(
      prepareScript(this.script, _.cloneDeep(this.payload)),
      this.opts
    );

    const contextVars = await handleScriptHook(
      hook,
      runnableScript,
      this.events,
      initialContextVars
    );

    debug(`hook ${hook} context vars`, contextVars);

    return contextVars;
  }
}

module.exports = PlatformLocal;
