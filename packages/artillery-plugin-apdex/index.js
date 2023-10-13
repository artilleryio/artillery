/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const debug = require('debug')('plugin:apdex');

const METRICS = {
  satisfied: 'apdex.satisfied',
  tolerated: 'apdex.tolerated',
  frustrated: 'apdex.frustrated'
};
class ApdexPlugin {
  constructor(script, _events) {
    this.script = script;

    if (
      global.artillery &&
      Number(global.artillery.version.slice(0, 1)) > 1 &&
      typeof process.env.LOCAL_WORKER_ID !== 'undefined'
    ) {
      const t =
        script.config.apdex?.threshold ||
        script.config.plugins.apdex?.threshold ||
        500;

      if (!script.config.processor) {
        script.config.processor = {};
      }

      script.scenarios.forEach(function (scenario) {
        scenario.afterResponse = [].concat(scenario.afterResponse || []);
        scenario.afterResponse.push('apdexAfterResponse');
      });

      function apdexAfterResponse(req, res, userContext, events, done) {
        const total = res.timings.phases.total;
        events.emit('counter', METRICS.satisfied, 0);
        events.emit('counter', METRICS.tolerated, 0);
        events.emit('counter', METRICS.frustrated, 0);

        if (total <= t) {
          events.emit('counter', METRICS.satisfied, 1);
        } else if (total <= 4 * t) {
          events.emit('counter', METRICS.tolerated, 1);
        } else {
          events.emit('counter', METRICS.frustrated, 1);
        }

        return done();
      }

      script.config.processor.apdexAfterResponse = apdexAfterResponse;

      return;
    }

    global.artillery.ext({
      ext: 'beforeExit',
      method: async (testInfo) => {
        if (
          typeof this.script?.config?.apdex === 'undefined' ||
          typeof process.env.ARTILLERY_DISABLE_ENSURE !== 'undefined'
        ) {
          return;
        }

        const s = testInfo.report.counters[METRICS.satisfied] || 0;
        const t = testInfo.report.counters[METRICS.tolerated] || 0;
        const f = testInfo.report.counters[METRICS.frustrated] || 0;
        const total = s + t + f;
        if (total > 0) {
          const apdexScore = (s + t / 2) / total;
          let ranking = '';
          if (apdexScore >= 0.94) {
            ranking = 'excellent';
          } else if (apdexScore >= 0.85) {
            ranking = 'good';
          } else if (apdexScore >= 0.7) {
            ranking = 'fair';
          } else if (apdexScore >= 0.49) {
            ranking = 'poor';
          } else {
            ranking = 'unacceptable';
          }

          global.artillery.apdexPlugin = {
            apdex: apdexScore,
            ranking
          };

          console.log(`\nApdex score: ${apdexScore} (${ranking})`);
        }
      }
    });
  }
}

module.exports = {
  Plugin: ApdexPlugin
};
