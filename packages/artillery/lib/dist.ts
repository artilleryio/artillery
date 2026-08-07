/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import assert from 'node:assert';
import L from 'lodash';
import { isIdlePhase } from './core/index.ts';
import type { PhaseSpec } from './core/phases.ts';

export default divideWork;

// Structural view of a prepared script as divideWork consumes it:
// phases and (optional) payload data are present and normalized.
interface DividableScript {
  config: {
    phases: PhaseSpec[];
    payload?: Array<{ data: unknown[] } & Record<string, any>>;
    [key: string]: any;
  };
  before?: unknown;
  after?: unknown;
  [key: string]: any;
}

/**
 *
 * Create a number of scripts for workers from the script given to use by user.
 *
 * @param {Script} script
 * @param {number} numWorkers
 * @returns {Script[]} array of scripts distributed representing the work for each worker
 *
 * @todo: Distribute payload data to workers
 */
function divideWork(
  script: DividableScript,
  numWorkers: number
): DividableScript[] {
  const workerScripts = createWorkerScriptBases(numWorkers, script);
  for (const phase of script.config.phases) {
    //  switching on phase type to determine how to distribute work
    switch (true) {
      case !!phase.rampTo: {
        handleRampToPhase(phase, numWorkers, workerScripts);
        break;
      }
      case !!phase.arrivalRate: {
        handleArrivalRatePhase(phase, numWorkers, workerScripts);
        break;
      }
      case !!phase.arrivalCount: {
        // arrivalCount is executed in the first worker
        // and replaced with a `pause` phase in the others
        handleArrivalCountPhase(workerScripts, phase, numWorkers);
        break;
      }
      case !!phase.pause: {
        // nothing to adjust here, pause is executed in all workers
        for (let i = 0; i < numWorkers; i++) {
          workerScripts[i].config.phases.push(L.cloneDeep(phase));
        }
        break;
      }
      default: {
        console.log(
          'Unknown phase spec definition, skipping.\n%j\n' +
            'This should not happen',
          phase
        );
      }
    }
  }

  // Filter out scripts which have only idle phases
  const result = workerScripts.filter(
    (workerScript) => !workerScript.config.phases.every(isIdlePhase)
  );

  // Add worker and totalWorkers properties to phases
  const hasPayload = scriptHasPayload(script);
  for (let i = 0; i < result.length; i++) {
    for (const phase of result[i].config.phases) {
      phase.totalWorkers = result.length;
      phase.worker = i + 1;
    }

    // Distribute payload data to workers
    if (hasPayload) {
      const payload = script.config.payload as Array<{ data: unknown[] }>;
      for (let payloadIdx = 0; payloadIdx < payload.length; payloadIdx++) {
        // If there are more workers than payload data, then we will repeat the payload data
        const scriptPayloadData = payload[payloadIdx].data;
        const idxToMatch = i % scriptPayloadData.length;
        (result[i].config.payload as Array<{ data: unknown[] }>)[
          payloadIdx
        ].data = scriptPayloadData.filter(
          (_, index) => index % result.length === idxToMatch
        );
      }
    }
  }

  return result;
}

function scriptHasPayload(script: DividableScript): boolean {
  return Boolean(script.config.payload && script.config.payload.length > 0);
}

function handleArrivalCountPhase(
  workerScripts: DividableScript[],
  phase: PhaseSpec,
  numWorkers: number
) {
  workerScripts[0].config.phases.push(L.cloneDeep(phase));

  for (let i = 1; i < numWorkers; i++) {
    workerScripts[i].config.phases.push({
      name: phase.name,
      pause: phase.duration
    });
  }
}

function handleArrivalRatePhase(
  phase: PhaseSpec,
  numWorkers: number,
  workerScripts: DividableScript[]
) {
  const rates = distribute(phase.arrivalRate as number, numWorkers);
  const activeWorkers = rates.reduce(
    (acc, rate) => acc + (rate > 0 ? 1 : 0),
    0
  );
  const maxVusers = phase.maxVusers
    ? distribute(phase.maxVusers, activeWorkers)
    : false;
  for (let i = 0; i < numWorkers; i++) {
    const newPhase = L.cloneDeep(phase);
    newPhase.arrivalRate = rates[i];
    if (maxVusers) {
      newPhase.maxVusers = maxVusers[i];
    }
    workerScripts[i].config.phases.push(newPhase);
  }
}

function handleRampToPhase(
  phase: PhaseSpec,
  numWorkers: number,
  workerScripts: DividableScript[]
) {
  phase.arrivalRate = phase.arrivalRate || 0;

  const rate = phase.arrivalRate / numWorkers;
  const ramp = (phase.rampTo as number) / numWorkers;
  const activeWorkers = rate > 0 || ramp > 0 ? numWorkers : 0;
  const maxVusers = phase.maxVusers
    ? distribute(phase.maxVusers, activeWorkers)
    : false;

  for (let i = 0; i < numWorkers; i++) {
    const newPhase = L.cloneDeep(phase);
    newPhase.arrivalRate = rate;
    newPhase.rampTo = ramp;
    if (maxVusers) {
      newPhase.maxVusers = maxVusers[i];
    }
    workerScripts[i].config.phases.push(newPhase);
  }
}

function createWorkerScriptBases(
  numWorkers: number,
  script: DividableScript
): DividableScript[] {
  const bases: DividableScript[] = [];
  for (let i = 0; i < numWorkers; i++) {
    const newScript = L.cloneDeep({
      ...script,
      config: {
        ...script.config,
        phases: [],
        ...(scriptHasPayload(script) && {
          payload: (script.config.payload as Array<Record<string, any>>).map(
            (payload) => {
              return {
                ...payload,
                data: []
              };
            }
          )
        })
      }
    });
    // 'before' and 'after' hooks are executed in the main thread
    delete newScript.before;
    delete newScript.after;

    bases.push(newScript);
  }
  return bases;
}

function distribute(m: number | string, n: number | string): number[] {
  m = Number(m);
  n = Number(n);

  const result: number[] = [];

  if (m < n) {
    for (let i = 0; i < n; i++) {
      result.push(i < m ? 1 : 0);
    }
  } else {
    const baseCount = Math.floor(m / n);
    let extraItems = m % n;
    for (let i = 0; i < n; i++) {
      result.push(baseCount);
      if (extraItems > 0) {
        result[i]++;
        extraItems--;
      }
    }
  }
  assert(m === sum(result), `${m} === ${sum(result)}`);
  return result;
}

function sum(a: number[]): number {
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result += a[i];
  }
  return result;
}

if (process.argv[1] === import.meta.filename) {
  console.log(distribute(1, 4));
  console.log(distribute(1, 10));
  console.log(distribute(4, 4));
  console.log(distribute(87, 4));
  console.log(distribute(50, 8));
  console.log(distribute(39, 20));
  console.log(distribute(20, 4));
  console.log(distribute(19, 4));
  console.log(distribute(20, 3));
  console.log(distribute(61, 4));
  console.log(distribute(121, 4));
  console.log(distribute(32, 3));
  console.log(distribute(700, 31));
  console.log(distribute(700, 29));
}
