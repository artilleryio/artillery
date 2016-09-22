/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//
// Artillery Core worker process
//

'use strict';

const core = require('../../artillery-core');
const createRunner = core.runner;
const debug = require('debug')('artillery:worker');

const path = require('path');

process.on('message', onMessage);
process.once('SIGTERM', cleanup);
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
    // TODO: clean up
  }
}

function cleanup() {
  debug('[%s] SIGTERM received', process.pid);
  process.exit(0);
}

function onError(err) {
  console.error(err);
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
