/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */



const fs = require('node:fs');

module.exports = Plugin;

function Plugin(_config, ee) {
  ee.on('stats', (_stats) => {});

  ee.on('done', (stats) => {
    const report = stats.report();
    console.log({ report });
    fs.appendFileSync('plugin-data.csv', `${report.requestsCompleted}\n`);
  });

  return this;
}
