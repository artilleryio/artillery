/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Message protocol between the local platform (parent) and worker
// threads. The parent sends WorkerCommand via postMessage; the worker
// replies with WorkerEnvelope (a WorkerEvent plus sender id and
// timestamp).
//
// Remote platforms (Lambda, Fargate, ACI) use related but distinct
// queue message shapes; mapping those onto this protocol is future
// work (modernization plan F7).

import type { PhaseSpec } from '../../core/phases.ts';
import type { StashDetails } from '../../stash.ts';

export interface PrepareWorkerOptions {
  script: Record<string, any>;
  payload: unknown;
  options: Record<string, any>;
  testRunId: string;
  // Fetched once by the main process; workers must not call the
  // cloud API themselves:
  stashDetails?: StashDetails | null;
}

export type WorkerCommand =
  | { command: 'prepare'; opts: PrepareWorkerOptions }
  // opts are the parsed context variables from the 'before' hook:
  | { command: 'run'; opts: Record<string, any> }
  | { command: 'stop' };

export type WorkerEvent =
  | { event: 'log'; args: unknown[] }
  | {
      event: 'workerError';
      error: Error;
      level?: string;
      aggregatable?: boolean;
      logs?: unknown;
    }
  | { event: 'phaseStarted'; phase: PhaseSpec }
  | { event: 'phaseCompleted'; phase: PhaseSpec }
  // Serialized metrics (SSMS.serializeMetrics):
  | { event: 'stats'; stats: string }
  | { event: 'done'; report: string }
  | { event: 'running' }
  | { event: 'readyWaiting' }
  | { event: 'setSuggestedExitCode'; code: number };

export type WorkerEnvelope = WorkerEvent & { id: number; ts: number };
