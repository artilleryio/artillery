/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const debug = require('debug')('plugin:apdex');

class ApdexPlugin {
  constructor(script, _events) {
    this.script = script;

    const t = script.config.apdex?.threshold || script.config.plugins.apdex?.threshold || 500;

    if (!script.config.processor) {
      script.config.processor = {};
    }

    script.scenarios.forEach(function (scenario) {
      scenario.afterResponse = [].concat(scenario.afterResponse || []);
      scenario.afterResponse.push('apdexAfterResponse');
    });

    function apdexAfterResponse(req, res, userContext, events, done) {
      // apdex = ( satisfied + tolerating / 2 ) / total
      const total = res.timings.phases.total;
      if (total <= t) {
        events.emit('counter', 'apdex_satisfied', 1);
      } else if (total <= 4 * t) {
        events.emit('counter', 'apdex_tolerated', 1);
      } else {
        events.emit('counter', 'apdex_frustrated', 1);
      }

      return done();
    }

    script.config.processor.apdexAfterResponse = apdexAfterResponse;
  }
}

module.exports = {
  Plugin: ApdexPlugin
}
