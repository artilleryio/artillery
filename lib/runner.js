/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//
// Run a pre-validated and pre-prepared test script across a number of
// (local) workers.
//

'use strict';

const os = require('os');
const path = require('path');
const EventEmitter = require('events');
const fork = require('child_process').fork;

const debug = require('debug')('artillery:runner');
const L = require('lodash');

const stats = require('./dispatcher').stats;
const divideWork = require('./dist');

const A = require('async');
const pidusage = require('pidusage');

module.exports = createRunner;

function createRunner(script, payload, opts) {
  const runner = new Runner(script, payload, opts);
  return runner;
}

function Runner(script, payload, opts) {
  this._script = script;
  this._payload = payload;
  this._opts = opts;
  this._workers = {};

  this.events = new EventEmitter();

  this._intermediates = [];
  this._allIntermediates = [];

  this._currentPhase = -1;

  return this;
}

Runner.prototype.run = function run() {
  //
  // Create worker scripts (distribute the work):
  //
  let self = this;
  let numWorkers = process.env.ARTILLERY_WORKERS || os.cpus().length;
  let workerScripts = divideWork(this._script, numWorkers);
  // Overwrite statsInterval for workers:
  L.each(workerScripts, function(s) {
    s.config.statsInterval = 1;
  });

  debug(JSON.stringify(workerScripts, null, 4));

  //
  // Create workers:
  //
  const DEBUGGER_PORT = 41986;
  L.each(workerScripts, (script, idx) => {
    let forkOptions = {};
    // If running under a debugger, set non-clashing debugger ports for worker
    // processes.
    // Run with: node --debug --expose_debug_as=v8debug --inspect
    const debugging = (typeof v8debug === 'object');
    if (debugging) {
      forkOptions.execArgv = [`--debug=${DEBUGGER_PORT + idx}`];
    }
    let workerProcess = fork(path.join(__dirname, 'worker.js'), forkOptions);
    this._workers[workerProcess.pid] = {
      proc: workerProcess,
      isDone: false, // ran through to completion, ie emitted 'done' event
      isStopping: false, // was asked to stop (to distinguish between process exiting gracefully and crashing)
      hasExited: false
    };
    if(debugging) {
      debug(`forked worker ${workerProcess.pid}; debugger on port ${DEBUGGER_PORT + idx}`);
    } else {
      debug(`forked worker ${workerProcess.pid}`);
    }
    workerProcess.on('message', this._onWorkerMessage.bind(this));

    workerProcess.once('exit', () => {
      this._workers[workerProcess.pid].hasExited = true;

      if (!this._workers[workerProcess.pid].isDone && !this._workers[workerProcess.pid].isStopping) {
        debug(`worker ${workerProcess.pid} terminated prematurely`);
        console.log('Unexpected error, Artillery shutting down.');
        self.shutdown(function() {
          process.exit(1);
        });
      } else {
        debug(`worker ${workerProcess.pid} stopped`);
      }
    });
    workerProcess.send({
      command: 'run',
      opts: {
        script: script,
        payload: this._payload, // FIXME: Inefficient with large payloads
        options: this._opts
      }
    });
  });

  // TODO: Use nanotimer
  this._statsInterval = setInterval(
    this._sendStats.bind(this),
    this._script.config.statsInterval * 1000
  );

  // Watch CPU usage of child processes:
  const MELTING_POINT = process.env.ARTILLERY_CPU_THRESHOLD || 90;
  const CPU_CHECK_INTERVAL_MS = 2500;
  const CPU_HOT_BEFORE_WARN = (process.env.CPU_HOT_BEFORE_WARN || 10) * 1000;
  let mpe = 0;
  setInterval(function() {
    A.map(
      Object.keys(self._workers),
      pidusage.stat,
      function cpuCollected(err, pidStats) {
        if (err) {
          return;
        }
        debug('cpu usage:', pidStats.map((o) => { return o.cpu; }));
        const busyPids = pidStats.filter(function(o) {
          return o && o.cpu && o.cpu >= MELTING_POINT;
        });
        if (busyPids.length > 0) {
          mpe++;
        }

        if (mpe * CPU_CHECK_INTERVAL_MS >= CPU_HOT_BEFORE_WARN) {
          self.events.emit('highcpu', busyPids);
          mpe = 0;
        }
        debug('busyPids:', busyPids);
      });
  }, CPU_CHECK_INTERVAL_MS).unref();

  return this;
};

Runner.prototype.shutdown = function(done) {
  let self = this;
  A.eachSeries(
    Object.keys(this._workers),
    function(pid, next) {
      if (!self._workers[pid].hasExited) {
        self._workers[pid].proc.send({ command: 'stop' });
      }
      self._workers[pid].isStopping = true;
      return next(null);
    }, function(err) {
      if (err) {
        debug(err);
      }

      // Poll until all workers are done:
      let pollInterval = setInterval(function() {
        let allDone = L.every(
          Object.keys(self._workers),
          function isDone(pid) {
            return self._workers[pid].hasExited;
          });

        if (allDone) {
          debug('All workers done');
          clearInterval(pollInterval);
          return done();
        }
      }, 200);
    });
};

Runner.prototype._sendStats = function() {
  // Calculate average concurrency:
  // We are averaging and overwriting the value in the report ourselves because
  // combine() presumes that stats objects come from different workers, but
  // we will have multiple intermediate objects from the same worker.

  // Calculate max concurrency (sampled at one second resolution):
  let maxWorkerConcurrencies = L.reduce(
    this._intermediates,
    function(acc, el) {
      const pid = el[0];
      const intermediate = el[1];
      if (typeof acc[pid] !== 'undefined') {
        acc[pid] = L.max([acc[pid], intermediate._concurrency]);
      } else {
        acc[pid] = intermediate._concurrency;
      }
      return acc;
    }, {});

  debug('max worker concurrency: %j', maxWorkerConcurrencies);

  let averageConcurrency = stats.round(
    L.sum(
      L.map(maxWorkerConcurrencies, function(v) { return v; })),
    1);

  let combined = stats.combine(
    L.map(this._intermediates, function(el) { return el[1]; }));

  combined._concurrency = averageConcurrency;

  this.events.emit('stats', combined);
  this._intermediates = [];
};

Runner.prototype._onWorkerMessage = function _onWorkerMessage(message) {
  if (message.event === 'phaseStarted') {
    if (message.phase.index > this._currentPhase) {
      this.events.emit('phaseStarted', message.phase);
      this._currentPhase = message.phase.index;
    }
  }

  if (message.event === 'phaseCompleted') {
  }

  if (message.event === 'stats') {
    this._intermediates.push([message.pid, message.stats]);
    this._allIntermediates.push(message.stats);
  }

  if (message.event === 'done') {
    clearInterval(this._statsInterval);
    let worker = this._workers[message.pid];
    worker.isDone = true;

    // This might never be emitted (e.g. if interrupted with a SIGINT)
    if (this._activeWorkerCount() === 0) {
      this._sendStats();
      this.events.emit('done', stats.combine(this._allIntermediates));
    }
  }
};

Runner.prototype._activeWorkerCount = function _activeWorkerCount() {
  var pids = Object.keys(this._workers);
  var count = pids.length;
  pids.forEach((pid) => {
    if (this._workers[pid].isDone) {
      count--;
    }
  });
  return count;
};
