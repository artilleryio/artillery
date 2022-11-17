/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

function packagedPlugin(config, ee) {
  ee.on('done', function (stats) {
    ee.emit('plugin_loaded', stats);
  });
  return this;
}

module.exports = packagedPlugin;
