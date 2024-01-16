/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const debug = require('debug')('plugin:publish-metrics:honeycomb');

class HoneycombReporter {
  constructor(config, events, script) {
    if (!config.apiKey && !config.writeKey) {
      this.config = config;
      throw new Error(
        'Honeycomb reporter: apiKey or writeKey must be provided. More info in the docs (https://docs.art/reference/extensions/publish-metrics#honeycomb)'
      );
    }
  }

  cleanup(done) {
    debug('Cleaning up');
    return done();
  }
}

function createHoneycombReporter(config, events, script) {
  return new HoneycombReporter(config, events, script);
}

module.exports = {
  createHoneycombReporter
};
