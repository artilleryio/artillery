/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const assert = require('assert');
const L = require('lodash');
const isIdlePhase = require('../core/lib/is-idle-phase');

module.exports = divideWork;

/**
 * Create a number of scripts for workers from the script given to use by user.
 */
function divideWork(script, numWorkers) {
  let newPhases = [];
  for (let i = 0; i < numWorkers; i++) {
    newPhases.push(L.cloneDeep(script.config.phases));
  }

  //
  // Adjust phase definitions:
  //
  L.each(script.config.phases, function (phase, phaseSpecIndex) {
    if (phase.arrivalRate && phase.rampTo) {
      let rates = distribute(phase.arrivalRate, numWorkers);
      let ramps = distribute(phase.rampTo, numWorkers);
      L.each(rates, function (Lr, i) {
        newPhases[i][phaseSpecIndex].arrivalRate = rates[i];
        newPhases[i][phaseSpecIndex].rampTo = ramps[i];
      });
      return;
    }

    if (phase.arrivalRate && !phase.rampTo) {
      let rates = distribute(phase.arrivalRate, numWorkers);
      L.each(rates, function (Lr, i) {
        newPhases[i][phaseSpecIndex].arrivalRate = rates[i];
      });
      return;
    }

    if (phase.arrivalCount) {
      // arrivalCount is executed in the first worker
      // and replaced with a `pause` phase in the others
      for (let i = 1; i < numWorkers; i++) {
        newPhases[i][phaseSpecIndex] = {
          name: phase.name,
          pause: phase.duration
        };
      }

      return;
    }

    if (phase.pause) {
      // nothing to adjust here
      return;
    }

    console.log(
      'Unknown phase spec definition, skipping.\n%j\n' +
        'This should not happen',
      phase
    );
  });

  //
  // Create new scripts:
  //
  let newScripts = L.map(L.range(0, numWorkers), function (i) {
    let newScript = L.cloneDeep(script);
    newScript.config.phases = newPhases[i];

    // 'before' and 'after' hooks are executed in the main thread
    delete newScript.before;
    delete newScript.after;

    return newScript;
  });

  // Filter out scripts which have only idle phases
  const result = [];
  for (const s of newScripts) {
    const allIdle = L.every(s.config.phases, function (phase, phaseSpecIndex) {
      return isIdlePhase(phase);
    });
    if (!allIdle) {
      result.push(s);
    }
  }

  return result;
}

/**
 * Given M "things", distribute them between N peers as equally as possible
 */
function distribute(m, n) {
  m = Number(m);
  n = Number(n);

  let result = [];

  if (m < n) {
    for (let i = 0; i < n; i++) {
      result.push(i < m ? 1 : 0);
    }
  } else {
    let baseCount = Math.floor(m / n);
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

function sum(a) {
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result += a[i];
  }
  return result;
}

if (require.main === module) {
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
