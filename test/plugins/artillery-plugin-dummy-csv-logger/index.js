/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const fs = require('fs');

module.exports = Plugin;

function Plugin(config, ee) {
  ee.on('stats', function (stats) {
  });

  ee.on('done', function(stats) {
    const report = stats.report();
    console.log({report});
    fs.appendFileSync('plugin-data.csv', report.requestsCompleted + '\n');
  });

  return this;
}
