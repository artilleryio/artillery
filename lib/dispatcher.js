/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const core = require('../core');
const version = require('../package.json').version;

function createGlobalObject(opts) {
  if (typeof global.artillery !== 'undefined') {
    return;
  }

  global.artillery = {
    version: version,
    util: {
      template: require('../util').template
    }
  };
}

createGlobalObject();

module.exports = core;
