/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//
// Artillery Core worker process
//

'use strict';

const core = require('artillery-core');
const createRunner = core.runner;
const debug = require('debug')('artillery:worker');

const path = require('path');

process.on('message', onMessage);
let shuttingDown = false;
function ignore() {
  debug('[%s] signal ignored', process.pid);
}
process.once('SIGTERM', ignore);
process.once('SIGINT', ignore);
process.on('error', onError);
process.on('uncaughtException', panic);

//
// Possible messages: run, stop
//

function onMessage(message) {
  if (message.command === 'run') {
    run(message.opts);
    return;
  }

  if (message.command === 'stop') {
    cleanup();
  }
}

function cleanup() {
  if (shuttingDown) {
    return;
  }
  debug('[%s] shutting down', process.pid);
  shuttingDown = true;
  process.exit(0);
}

function onError(err) {
  debug(err);
  debug('[%s] Worker can\'t send() to parent. Parent is probably dead. Shutting down.', process.pid);
  cleanup();
}

function panic(err) {
  console.error(err);
  process.exit(1);
}

function run(opts) {

  // load processor if needed:
  if (opts.script.config.processor) {
    let absoluteScriptPath = path.resolve(process.cwd(), opts.options.scriptPath);
    let processorPath = path.resolve(path.dirname(absoluteScriptPath), opts.script.config.processor);
    let processor = require(processorPath);
    opts.script.config.processor = processor;
  }

  var runner = createRunner(opts.script, opts.payload, opts.options);

  runner.on('phaseStarted', onPhaseStarted);
  runner.on('phaseCompleted', onPhaseCompleted);
  runner.on('stats', onStats);
  runner.on('done', onDone);

  runner.run();

  function onPhaseStarted(phase) {
    send({ event: 'phaseStarted', phase: phase });
  }

  function onPhaseCompleted(phase) {
    send({ event: 'phaseCompleted', phase: phase });
  }

  function onStats(stats) {
    send({ event: 'stats', stats: stats });
  }

  function onDone(report) {
    send({ event: 'done', report: report });
  }
}

function send(data) {
  process.send(Object.assign({ pid: process.pid }, data));
}
