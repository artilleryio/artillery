/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const debug = require('debug')('plugin:expect');

class EnsurePlugin {
  constructor(script, events) {
    this.script = script;
    this.events = events;

    // TODO: check global.artillery.version

    global.artillery.ext(
      {
        ext: 'beforeExit',
        method: async (data) => {
          if (this.script.config.ensure && typeof process.env.ARTILLERY_DISABLE_ENSURE === 'undefined') {
            const latency = data.report.latency;
            Object.keys(this.script.config.ensure).forEach((k) => {
              const max = this.script.config.ensure[k];


              let bucket = k === 'p50' ? 'median' : k;

              if (latency[bucket]) {
                if (latency[bucket] > max) {
                  global.artillery.metrics.event(`ensure condition failed: ensure.${bucket} expected to be < ${max} but is ${latency[bucket]}`, {level: 'error'});
                  global.artillery.suggestedExitCode = 1;
                }
              }
            });

            if (typeof this.script.config.ensure.maxErrorRate !== 'undefined') {
              const failRate = Math.round((data.report.scenariosCreated - data.report.scenariosCompleted) / data.report.scenariosCreated * 100);

              if (failRate > script.config.ensure.maxErrorRate) {
                global.artillery.metrics.event(`ensure condition failed: ensure.maxErrorRate expected to be <= ${script.config.ensure.maxErrorRate} but is ${failRate}`, {level: 'error'});
                global.artillery.suggestedExitCode = 1;
              }
            }
          }
        }
      }
    );
  }
}

module.exports = {
  Plugin: EnsurePlugin
};
