import createDebug from 'debug';
import core from '../../dispatcher.ts';
import { ArtilleryWorker } from './artillery-worker-local.ts';

const { handleScriptHook, prepareScript, loadProcessor } =
  core.runner.runnerFuncs;
const debug = createDebug('platform:local');

import EventEmitter from 'node:events';
import os from 'node:os';
import _ from 'lodash';
import divideWork from '../../dist.ts';
import STATES from '../worker-states.ts';
import type { WorkerState } from '../worker-states.ts';
import type { WorkerEnvelope } from './protocol.ts';
import { fetchStashDetails } from '../../stash.ts';
import type { StashDetails } from '../../stash.ts';

interface WorkerRecord {
  id: number;
  script: Record<string, any>;
  state: WorkerState;
  proc: ArtilleryWorker;
}

class PlatformLocal {
  declare script: { config: Record<string, any>; [key: string]: any };
  declare payload: unknown;
  declare opts: Record<string, any>;
  declare events: EventEmitter;
  declare platformOpts: Record<string, any>;
  declare workers: Record<string, WorkerRecord>;
  declare workerScripts: Array<Record<string, any>>;
  declare count: number;
  declare contextVars: unknown;

  constructor(
    script: { config: Record<string, any>; [key: string]: any },
    payload: unknown,
    opts: Record<string, any>,
    platformOpts: Record<string, any>
  ) {
    // We need these to run before/after hooks:
    this.script = script;
    this.payload = payload;
    this.opts = opts;
    this.events = new EventEmitter(); // send worker events such as workerError, etc
    this.platformOpts = platformOpts;
    this.workers = {};
    this.workerScripts = [];
    this.count = Infinity;
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
      this.workerScripts = divideWork(
        this.script as Parameters<typeof divideWork>[0],
        count
      );
      this.count = this.workerScripts.length;
    } else {
      // --count may only be used when mode is "multiply"
      this.count = this.platformOpts.count;
      this.workerScripts = new Array(this.count)
        .fill(undefined)
        .map((_) => this.script);
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

    const stashDetails = await this.getStashDetailsOnce();

    for (const [workerId, w] of Object.entries<any>(this.workers)) {
      this.opts.cliArgs = this.platformOpts.cliArgs;
      await this.prepareWorker(workerId, {
        script: w.script,
        payload: this.payload,
        options: this.opts,
        stashDetails
      });
      this.workers[workerId].state = STATES.preparing;
    }
    debug('workers prepared');

    // the initial context is stringified and copied to the workers
    const contextVarsString = JSON.stringify(this.contextVars);

    for (const [workerId, _w] of Object.entries(this.workers)) {
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

  // Stash is an Artillery Cloud feature. Fetch connection details once
  // in the main process and hand them to every worker via prepare -
  // workers make no cloud API calls of their own. Only reach out to
  // the cloud API when cloud reporting is enabled for this run:
  // `--record` for interactive use, WORKER_ID for cloud workers
  // (Fargate/Lambda/ACI). Mirrors ArtilleryCloudPlugin gating.
  // Presence of an API key alone must not trigger network calls:
  // on-prem/airgapped environments may blackhole app.artillery.io.
  async getStashDetailsOnce(): Promise<StashDetails | null> {
    const cliArgs = this.platformOpts.cliArgs;
    const cloudReportingEnabled =
      typeof cliArgs?.record !== 'undefined' ||
      typeof process.env.WORKER_ID !== 'undefined';

    if (!cloudReportingEnabled) {
      return null;
    }

    try {
      return await fetchStashDetails({ apiKey: cliArgs?.key });
    } catch (err) {
      if ((err as Error).name !== 'CloudAPIKeyMissing') {
        console.error(err);
      }
      return null;
    }
  }

  async createWorker() {
    const worker = new ArtilleryWorker();

    await worker.init();

    const workerId = worker.workerId;
    worker.events.on('workerError', (message: WorkerEnvelope) => {
      this.events.emit('workerError', workerId, message);
    });
    worker.events.on('log', (message: WorkerEnvelope) => {
      this.events.emit('log', workerId, message);
    });
    worker.events.on('phaseStarted', (message: WorkerEnvelope) => {
      this.events.emit('phaseStarted', workerId, message);
    });
    worker.events.on('phaseCompleted', (message: WorkerEnvelope) => {
      this.events.emit('phaseCompleted', workerId, message);
    });
    worker.events.on('stats', (message: WorkerEnvelope) => {
      this.events.emit('stats', workerId, message);
    });
    worker.events.on('done', (message: WorkerEnvelope) => {
      this.events.emit('done', workerId, message);
    });
    worker.events.on('readyWaiting', (message: WorkerEnvelope) => {
      this.events.emit('readyWaiting', workerId, message);
    });
    worker.events.on('setSuggestedExitCode', (message: WorkerEnvelope) => {
      this.events.emit('setSuggestedExitCode', workerId, message);
    });
    worker.events.on('exit', (message: number) => {
      this.events.emit('exit', workerId, message);
    });

    worker.events.on('error', (_err: Error) => {
      // TODO: Only exit if ALL workers fail, otherwise log and carry on
      process.nextTick(() => process.exit(11));
    });

    return worker;
  }

  async prepareWorker(
    workerId: string | number,
    opts: {
      script: Record<string, any>;
      payload: unknown;
      options: Record<string, any>;
      stashDetails?: StashDetails | null;
    }
  ) {
    return this.workers[workerId].proc.prepare(opts);
  }

  async runWorker(workerId: string | number, contextVarsString: string) {
    // TODO: this will become opts
    debug('runWorker', workerId);
    return this.workers[workerId].proc.run(contextVarsString);
  }

  async stopWorker(workerId: string | number) {
    return this.workers[workerId].proc.stop();
  }

  async shutdown() {
    // 'after' hook is executed in the main thread, after all workers
    // are done
    await this.runHook('after', this.contextVars);

    for (const [workerId, _w] of Object.entries(this.workers)) {
      await this.stopWorker(workerId);
    }
  }

  // ********

  async runHook(hook: 'before' | 'after', initialContextVars?: unknown) {
    if (!this.script[hook]) {
      return {};
    }

    const runnableScript = await loadProcessor(
      prepareScript(this.script, _.cloneDeep(this.payload)),
      this.opts as { scriptPath: string }
    );

    const contextVars = await handleScriptHook(
      hook,
      runnableScript,
      this.events,
      initialContextVars as Record<string, any> | undefined
    );

    debug(`hook ${hook} context vars`, contextVars);

    return contextVars;
  }
}

export default PlatformLocal;
