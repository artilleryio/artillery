/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import createDebug from 'debug';

//
// Artillery Core worker process
//

import { type MessagePort, parentPort, threadId } from 'node:worker_threads';
import * as core from '../../core/index.ts';
import type { PhaseSpec } from '../../core/phases.ts';
import type { RunnerInstance } from '../../core/runner.ts';
import type { PeriodMetrics } from '../../core/ssms.ts';
import type {
  PrepareWorkerOptions,
  WorkerCommand,
  WorkerEnvelope,
  WorkerEvent
} from './protocol.ts';

import { createGlobalObject } from '../../artillery-global.ts';
import { initStash } from '../../stash.ts';

const createRunner = core.runner.runner;
const debug = createDebug('artillery:worker');

import _path from 'node:path';

import { ssms as __ssms } from '../../core/index.ts';

const { SSMS } = __ssms;

import { promisify as p } from 'node:util';

import { EventEmitter } from 'eventemitter3';
import { loadPlugins, loadPluginsConfig } from '../../load-plugins.ts';

const { loadProcessor } = core.runner.runnerFuncs;

import prepareTestExecutionPlan from '../../util/prepare-test-execution-plan.ts';

process.env.LOCAL_WORKER_ID = String(threadId);

// This module only runs inside a worker thread, where parentPort is
// always set.
const port = parentPort as MessagePort;

port.on('message', onMessage);

let shuttingDown = false;

let runnerInstance: RunnerInstance | null = null;

global.artillery._workerThreadSend = send as (data: unknown) => void;

//
// Supported messages: run, stop
//

async function onMessage(message: WorkerCommand) {
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
            error: cleanupErr as Error,
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

async function prepare(opts: PrepareWorkerOptions) {
  await createGlobalObject();

  // Stash connection details are fetched once by the main process
  // (see PlatformLocal.getStashDetailsOnce) and passed in; workers
  // make no cloud API calls. initStash() only constructs a client -
  // @upstash/redis is HTTP-based and opens no connections here.
  global.artillery.stash = await initStash(opts.stashDetails);

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
  const script = await loadProcessor(
    _script as { config: Record<string, any> },
    options as { scriptPath: string }
  );

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
  for (const [name, result] of Object.entries(plugins)) {
    if (result.isLoaded) {
      // NOTE: pre-existing quirk: keyed assignment onto the plugins
      // array (used as both array and map - modernization plan F17).
      (global.artillery.plugins as unknown as Record<string, unknown>)[name] =
        result.plugin;
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

  function onPhaseStarted(phase: PhaseSpec) {
    send({ event: 'phaseStarted', phase: phase });
  }

  function onPhaseCompleted(phase: PhaseSpec) {
    send({ event: 'phaseCompleted', phase: phase });
  }

  function onStats(stats: PeriodMetrics) {
    send({ event: 'stats', stats: SSMS.serializeMetrics(stats) });
  }

  async function onDone(report: PeriodMetrics) {
    await (runnerInstance as RunnerInstance).stop();
    send({ event: 'done', report: SSMS.serializeMetrics(report) });
  }
}

async function run(opts: Record<string, any>) {
  if (runnerInstance) {
    runnerInstance.run(opts);
    send({ event: 'running' });
  } else {
    // TODO: Emit error / set state
  }
}

// TODO: id -> workerId, ts -> _ts
function send(data: WorkerEvent) {
  const payload: WorkerEnvelope = Object.assign(
    { id: threadId, ts: Date.now() },
    data
  );
  debug(payload);
  port.postMessage(payload);
}
