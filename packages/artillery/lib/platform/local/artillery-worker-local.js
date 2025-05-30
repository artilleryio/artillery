/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EventEmitter = require('eventemitter3');
const { Worker } = require('worker_threads');
const path = require('path');

const STATES = require('../worker-states');

const awaitOnEE = require('../../util/await-on-ee');

const returnWorkerEnv = (needsSourcemap) => {
  let env = { ...process.env };

  if (needsSourcemap) {
    env['NODE_OPTIONS'] = process.env.NODE_OPTIONS
      ? `${process.env.NODE_OPTIONS} --enable-source-maps`
      : '--enable-source-maps';
  }

  return env;
};

class ArtilleryWorker {
  constructor(opts) {
    this.opts = opts;
    this.events = new EventEmitter(); // events for consumers of this object
    this.workerEvents = new EventEmitter(); // turn events delivered via 'message' events into their own messages
  }

  async init(_opts) {
    this.state = STATES.initializing;

    const workerEnv = returnWorkerEnv(global.artillery.hasTypescriptProcessor);

    this.worker = new Worker(path.join(__dirname, 'worker.js'), {
      env: workerEnv
    });
    this.workerId = this.worker.threadId;
    this.worker.on('error', this.onError.bind(this));
    // TODO:
    this.worker.on('exit', (exitCode) => {
      this.events.emit('exit', exitCode);
    });

    //eslint-disable-next-line handle-callback-err
    this.worker.on('messageerror', (err) => {});

    // TODO: Expose performance metrics via getHeapSnapshot() and performance object.

    await awaitOnEE(this.worker, 'online', 10);

    // Relay messages onto the real event emitter:
    this.worker.on('message', (message) => {
      switch (message.event) {
        case 'log':
          this.events.emit('log', message);
          this.workerEvents.emit('log', message);
          break;
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
          break;
        case 'readyWaiting':
          this.events.emit('readyWaiting', message);
          this.workerEvents.emit('readyWaiting', message);
          break;
        case 'setSuggestedExitCode':
          this.events.emit('setSuggestedExitCode', message);
          break;
        default:
          global.artillery.log(
            `Unknown message from worker ${message}`,
            'error'
          );
      }
    });

    this.state = STATES.online;
  }

  async prepare(opts) {
    this.state = STATES.preparing;

    const { script, payload, options } = opts;
    let scriptForWorker = script;

    if (script.__transpiledTypeScriptPath && script.__originalScriptPath) {
      scriptForWorker = {
        __transpiledTypeScriptPath: script.__transpiledTypeScriptPath,
        __originalScriptPath: script.__originalScriptPath,
        __phases: script.config?.phases
      };
    }

    this.worker.postMessage({
      command: 'prepare',
      opts: {
        script: scriptForWorker,
        payload,
        options,
        testRunId: global.artillery.testRunId
      }
    });

    await awaitOnEE(this.workerEvents, 'readyWaiting', 50);
    this.state = STATES.readyWaiting;
  }

  async run(opts) {
    this.worker.postMessage({
      command: 'run',
      opts: JSON.parse(opts)
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

module.exports = {
  ArtilleryWorker,
  STATES
};
