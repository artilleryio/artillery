const { ArtilleryWorker } = require('./artillery-worker-local');
const core = require('../../dispatcher');
const { handleScriptHook, prepareScript, loadProcessor } =
  core.runner.runnerFuncs;
const debug = require('debug')('platform:local');
const EventEmitter = require('events');
const _ = require('lodash');

class PlatformLocal {
  constructor(script, payload, opts, platformOpts) {
    // We need these to run before/after hooks:
    this.script = script;
    this.payload = payload;
    this.opts = opts;
    this.events = new EventEmitter(); // send worker events such as workerError, etc

    this.workers = {};

    return this;
  }

  async init() {
    // 'before' hook is executed in the main thread,
    // its context is then passed to the workers
    const contextVars = await this.runHook('before');
    this.contextVars = contextVars; // TODO: Rename to something more descriptive

    return contextVars;
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

    this.workers[worker.workerId] = {
      proc: worker,
      state: worker.state // TODO: replace with getState() use
    };

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

  async getWorkerState(workerId) {}

  async shutdown() {
    // 'after' hook is executed in the main thread, after all workers
    // are done
    await this.runHook('after', this.contextVars);
  }

  // ********

  async runHook(hook, initialContextVars) {
    if (!this.script[hook]) {
      return {};
    }

    const runnableScript = loadProcessor(
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
