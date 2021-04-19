/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const Libhoney = require('libhoney');
const { attachScenarioHooks, versionCheck } = require('./util');
const debug = require('debug')('plugin:publish-metrics:honeycomb');

const { URL } = require('url');

class HoneycombReporter {
  constructor(config, events, script) {
    this.hnyOpts = {
      writeKey: config.apiKey || config.writeKey,
      dataset: config.dataset,
      disabled: config.enabled === false,
      batchTimeTrigger: 0,
      sampleRate: config.sampleRate || 1
    };

    if (!versionCheck('>=1.7.0')) {
      console.error(`[publish-metrics][honeycomb] Honeycomb support requires Artillery >= v1.7.0 (current version: ${global.artillery ? global.artillery.version || 'unknown' : 'unknown' })`);
    }

    this.hny = new Libhoney(this.hnyOpts);

    attachScenarioHooks(script, [{
      type: 'afterResponse',
      name: 'sendToHoneycomb',
      hook: this.sendToHoneycomb.bind(this)
    }]);

    debug('init done');
  }

  sendToHoneycomb(req, res, userContext, events, done) {
    const url = new URL(req.url);
    const payload = {
      url: url.href,
      host: url.host,
      method: req.method,
      statusCode: res.statusCode
    };

    // TODO: Check that we're on Artillery 1.6.3+ or 2+
    if (res.timings && res.timings.phases) {
      payload.responseTimeMs = res.timings.phases.firstByte;
    }

    this.hny.sendNow(payload);
    return done();
  }

  cleanup(done) {
    debug('cleaning up');
    if (!this.hnyOpts.disabled) {
      this.hny.flush();
    }
    return done();
  }
}

function createHoneycombReporter(config, events, script) {
  return new HoneycombReporter(config, events, script);
}

module.exports = {
  createHoneycombReporter
};
