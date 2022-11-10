/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function isIdlePhase(phase) {
  return (
    (phase.arrivalRate === 0 && !phase.rampTo) ||
    phase.arrivalCount === 0 ||
    phase.maxVusers === 0 ||
    phase.pause > 0
  );
}

module.exports = isIdlePhase;
