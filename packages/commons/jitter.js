/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

module.exports = {
  jitter: jitter
};

function jitter(sApprox) {
  if (!sApprox) {
    return sApprox;
  }

  if (typeof sApprox !== 'string') {
    return sApprox;
  }

  if (sApprox.indexOf(':') < 0) {
    return sApprox;
  }

  const inputs = sApprox.split(':');
  const nb = parseInt(inputs[0], 10);
  const approxPercent = parseInt(inputs[1], 10);

  let approx = approxPercent;
  if (inputs[1].indexOf('%') >= 0) {
    approx = (nb * approxPercent) / 100;
  }

  return Math.max(0, nb - approx + Math.random() * 2 * approx);
}
