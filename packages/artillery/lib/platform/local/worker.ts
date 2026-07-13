/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import createDebug from 'debug';

//
// Artillery Core worker process
//



import {
  parentPort,
  threadId
} from 'node:worker_threads';
import * as core from '@artilleryio/int-core';

import { createGlobalObject } from '../../artillery-global.ts';
import { getStash } from '../../stash.ts';

const createRunner = core.runner.runner;
const debug = createDebug('artillery:worker');

import _path from 'node:path';

import { ssms as __ssms } from '@artilleryio/int-core';

const { SSMS } = __ssms;

import { promisify as p } from 'node:util';

import { EventEmitter } from 'eventemitter3';
import { loadPlugins, loadPluginsConfig } from '../../load-plugins.ts';

const { loadProcessor } = core.runner.runnerFuncs;

import prepareTestExecutionPlan from '../../util/prepare-test-execution-plan.ts';

process.env.LOCAL_WORKER_ID = String(threadId);

parentPort.on('message', onMessage);

let shuttingDown = false;

let runnerInstance = null;

global.artillery._workerThreadSend = send;

//
// Supported messages: run, stop
//

async function onMessage(message) {
  if (message.command === 'prepare') {
    await prepare(message.opts);
    return;
  }

  if (message.command === 'run') {
    run(message.opts);
    return;
  }

  if (message.command === 'stop') {
    await cleanup();

    // Unload plugins
    // TODO: v3 plugins
    for (const o of global.artillery.plugins) {
      if (o.plugin.cleanup) {
        try {
          await p(o.plugin.cleanup.bind(o.plugin))();
          debug('plugin unloaded:', o.name);
        } catch (cleanupErr) {
          send({
            event: 'workerError',
            error: cleanupErr,
            level: 'error',
            aggregatable: true
          });
        }
      }
    }

    process.exit(0);
  }
}

async function cleanup() {
  return new Promise<void>((resolve, _reject) => {
    if (shuttingDown) {
      resolve();
    }
    shuttingDown = true;

    if (runnerInstance && typeof runnerInstance.stop === 'function') {
      runnerInstance.stop().then(() => {
        resolve();
      });
    } else {
      resolve();
    }
  });
}

async function createGlobalStashClient(cliArgs) {
  try {
    global.artillery.stash = await getStash({
      apiKey: cliArgs?.key || process.env.ARTILLERY_CLOUD_API_KEY
    });
  } catch (error) {
    if (error.name !== 'CloudAPIKeyMissing') {
      console.error(error);
    }
    global.artillery.stash = null;
  }
}

async function prepare(opts) {
  await createGlobalObject();
  await createGlobalStashClient(opts.options.cliArgs);

  global.artillery.globalEvents.on('log', (...args) => {
    send({ event: 'log', args });
  });

  let _script;
  if (
    opts.script.__transpiledTypeScriptPath &&
    opts.script.__originalScriptPath
  ) {
    // Load and process pre-compiled TypeScript file
    _script = await prepareTestExecutionPlan(
      [opts.script.__originalScriptPath],
      opts.options.cliArgs,
      []
    );
  } else {
    _script = opts.script;
  }

  const { payload, options } = opts;
  const script = await loadProcessor(_script, options);

  if (opts.script.__phases) {
    script.config.phases = opts.script.__phases;
  }

  global.artillery.testRunId = opts.testRunId;

  //
  // load plugins
  //
  const plugins = await loadPlugins(script.config.plugins, script, options);

  // NOTE: We don't subscribe plugins to stats/done events from
  // individual runner instances here - those are handled in
  // launch-platform instead. (If we subscribe plugins to events here,
  // they will receive individual stats/done events from workers,
  // instead of objects that have been properly aggregated.)
  const stubEE = new EventEmitter();
  for (const [name, result] of Object.entries<any>(plugins)) {
    if (result.isLoaded) {
      global.artillery.plugins[name] = result.plugin;
      if (result.version === 3) {
        // TODO: v3 plugins
      } else {
        //         const msg = `WARNING: Legacy plugin detected: ${name}
        // See https://artillery.io/docs/resources/core/v2.html for more details.`;
        //         send({
        //           event: 'workerError',
        //           error: new Error(msg),
        //           level: 'warn',
        //           aggregatable: true
        //         });

        script.config = {
          ...script.config,
          // Load additional plugins configuration from the environment
          plugins: loadPluginsConfig(script.config.plugins)
        };

        if (result.version === 1) {
          result.plugin = new result.PluginExport(script.config, stubEE);
          global.artillery.plugins.push(result);
        } else if (result.version === 2) {
          result.plugin = new result.PluginExport.Plugin(
            script,
            stubEE,
            options
          );
          global.artillery.plugins.push(result);
        } else {
          // TODO:
        }
      }
    } else {
      const msg = `WARNING: Could not load plugin: ${name}`;
      send({
        event: 'workerError',
        error: new Error(msg),
        level: 'warn',
        aggregatable: true
      });
    }
  }

  // TODO: use await
  createRunner(script, payload, options)
    .then((runner) => {
      runnerInstance = runner;

      runner.on('phaseStarted', onPhaseStarted);
      runner.on('phaseCompleted', onPhaseCompleted);
      runner.on('stats', onStats);
      runner.on('done', onDone);

      // TODO: Enum for all event types
      send({ event: 'readyWaiting' });
    })
    .catch((err) => {
      // TODO: Clean up and exit (error state)
      // TODO: Handle workerError in launcher when readyWaiting
      // is not received and worker exits.
      send({
        event: 'workerError',
        error: err,
        level: 'error',
        aggregatable: true
      });
    });

  function onPhaseStarted(phase) {
    send({ event: 'phaseStarted', phase: phase });
  }

  function onPhaseCompleted(phase) {
    send({ event: 'phaseCompleted', phase: phase });
  }

  function onStats(stats) {
    send({ event: 'stats', stats: SSMS.serializeMetrics(stats) });
  }

  async function onDone(report) {
    await runnerInstance.stop();
    send({ event: 'done', report: SSMS.serializeMetrics(report) });
  }
}

async function run(opts) {
  if (runnerInstance) {
    runnerInstance.run(opts);
    send({ event: 'running' });
  } else {
    // TODO: Emit error / set state
  }
}

// TODO: id -> workerId, ts -> _ts
function send(data) {
  const payload = Object.assign({ id: threadId, ts: Date.now() }, data);
  debug(payload);
  parentPort.postMessage(payload);
}
