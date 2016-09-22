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

const stats = require('../../artillery-core').stats;
const distribute = require('./dist');

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
  L.each(workerScripts, (script) => {
    let workerProcess = fork(path.join(__dirname, 'worker.js'));
    this._workers[workerProcess.pid] = {
      proc: workerProcess,
      isDone: false
    };
    workerProcess.on('message', this._onWorkerMessage.bind(this));
    workerProcess.send({
      command: 'run',
      opts: {
        script: script,
        payload: this._payload, // FIXME: Inefficient with large payloads
        options: this._opts
      }
    });
  });

  setInterval(
    this._sendStats.bind(this),
    this._script.config.statsInterval * 1000).unref();
  return this;
};

Runner.prototype._sendStats = function() {
  this.events.emit('stats', stats.combine(this._intermediates));
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
    this._intermediates.push(message.stats);
    this._allIntermediates.push(message.stats);
  }

  if (message.event === 'done') {
    let worker = this._workers[message.pid];
    worker.isDone = true;
    worker.proc.kill();

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

/**
 * Create a number of scripts for workers from the script given to use by user.
 */
// TODO: This should be its own module in future
function divideWork(script, numWorkers) {
  let newPhases = [];
  for (let i = 0; i < numWorkers; i++) {
    newPhases.push(L.cloneDeep(script.config.phases));
  }

  //
  // Adjust phase definitions:
  //
  L.each(script.config.phases, function(phase, phaseSpecIndex) {
    if (phase.arrivalRate && phase.rampTo) {
      let rates = distribute(phase.arrivalRate, numWorkers);
      let ramps = distribute(phase.rampTo, numWorkers);
      L.each(rates, function(Lr, i) {
        newPhases[i][phaseSpecIndex].arrivalRate = rates[i];
        newPhases[i][phaseSpecIndex].rampTo = ramps[i];
      });
      return;
    }

    if (phase.arrivalRate && !phase.rampTo) {
      let rates = distribute(phase.arrivalRate, numWorkers);
      L.each(rates, function(Lr, i) {
        newPhases[i][phaseSpecIndex].arrivalRate = rates[i];
      });
      return;
    }

    if (phase.arrivalCount) {
      let counts = distribute(phase.arrivalCount, numWorkers);
      L.each(counts, function(Lc, i) {
        newPhases[i][phaseSpecIndex].arrivalCount = counts[i];
      });
      return;
    }

    if (phase.pause) {
      // nothing to adjust here
      return;
    }

    console.log('Unknown phase spec definition, skipping.\n%j\n' +
                'This should not happen', phase);
  });

  //
  // Create new scripts:
  //
  let newScripts = L.map(L.range(0, numWorkers), function(i) {
    let newScript = L.cloneDeep(script);
    newScript.config.phases = newPhases[i];
    return newScript;
  });

  //
  // Adjust pool settings for HTTP if needed:
  //
  if (!L.isUndefined(L.get(script, 'config.http.pool'))) {
    let pools = distribute(script.config.http.pool, numWorkers);
    L.each(newScripts, function(s, i) {
      s.config.http.pool = pools[i];
    });
  }

  return newScripts;
}
