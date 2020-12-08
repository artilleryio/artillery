/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

module.exports = {
  run: require('./run'),
  quick: require('./quick'),
  report: require('./report'),
  convert: require('./convert'),
  dino: require('./dino')
};

const version = require('../../package.json').version;

const chalk = require('chalk');

function createGlobalObject(opts) {
  if (typeof global.artillery === 'object') {
    return;
  }

  global.artillery = {
    version: version,

    metrics: {
      event: async function(msg, opts) {
        if (opts.level === 'error') {
          console.log(chalk.red(msg));
        } else {
          console.log(msg);
        }
      }
    },

    util: {
      template: require('../util').template
    },

    plugins: [],

    extensionEvents: [],
    ext: async function(event) {
      // TODO: Validate events object
      this.extensionEvents.push(event);
    },
    suggestedExitCode: 0
  };
}

createGlobalObject();
