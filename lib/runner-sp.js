'use strict';

const EventEmitter = require('events');
const debug = require('debug')('artillery:runner');

const path = require('path');

const L = require('lodash');

const core = require('./dispatcher');
const Stats = core.stats;
const createDispatcher = core.runner;

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

  this._dispatcher = null;

  this._allIntermediates = [];

  this.events = new EventEmitter();
  return this;
}


// Events emitted:
// - stats
// - phaseStarted
// - done
// - highcpu

Runner.prototype.run = function() {
  let opts = {options: this._opts, script: this._script, payload: this._payload}; // FIXME:

  let self = this;

  let absoluteScriptPath = path.resolve(process.cwd(), opts.options.scriptPath);
  opts.options.absoluteScriptPath = absoluteScriptPath;
  if (opts.script.config.processor) {
    let processorPath = path.resolve(
      path.dirname(absoluteScriptPath),
      opts.script.config.processor);
    let processor = require(processorPath);
    opts.script.config.processor = processor;
  }

  createDispatcher(opts.script, opts.payload, opts.options).then(function(runner) {
    self._dispatcher = runner;
    runner.on('phaseStarted', (phase) => {
      self.events.emit('phaseStarted', phase);
    });

    runner.on('stats', (stats) => {
      self.events.emit('stats', stats);
      delete stats._entries;
      self._allIntermediates.push(stats);
    });

    runner.on('done', (report) => {
      self.events.emit('done', Stats.combine(self._allIntermediates));
    });

    runner.run();

    const MELTING_POINT = process.env.ARTILLERY_CPU_THRESHOLD || 90;
    const CPU_CHECK_INTERVAL_MS = 2500;
    const CPU_HOT_BEFORE_WARN = (process.env.CPU_HOT_BEFORE_WARN || 10) * 1000;
    let mpe = 0;

    setInterval(
      function checkCPU() {
        pidusage.stat(process.pid, function(err, pidStats) {
          if (err) {
            debug(err);
            return;
          }

          if (pidStats && pidStats.cpu && pidStats.cpu >= MELTING_POINT) {
            mpe++;
          }

          if (mpe * CPU_CHECK_INTERVAL_MS >= CPU_HOT_BEFORE_WARN) {
            self.events.emit('highcpu', [process.pid]);
            mpe = 0;
          }
        });
      },
      CPU_CHECK_INTERVAL_MS).unref();
  }).catch(function(err) {
    // TODO: Handle the error
    console.log(err);
  });
};

Runner.prototype.shutdown = function(done) {
  if (this._dispatcher && typeof this._dispatcher.stop === 'function') {
    this._dispatcher.stop(function(err) {
      if (err) {
        debug(err);
      }
      return done();
    });
  }
};
