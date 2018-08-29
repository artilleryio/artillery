/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const fs = require('fs');
const path = require('path');
const l = require('lodash');
const openfile = require('opn');

module.exports = report;

module.exports.getConfig = function(callback) {
  let commandConfig = {
    name: 'report',
    command: 'report <file>',
    description: 'Create a report from a JSON file created by "artillery run"',
    options: [
      ['-o, --output <path>', 'Set file to write html report to (will open in browser by default)']
    ]
  };

  if (callback) {
    return callback(null, commandConfig);
  } else {
    return commandConfig;
  }
};

function report(jsonReportPath, options) {

  let reportFilename = options.output || jsonReportPath + '.html';

  let data = JSON.parse(fs.readFileSync(jsonReportPath, 'utf-8'));

  data.intermediate.forEach(o => delete o.latencies);

  let templateFn = path.join(
    path.dirname(__filename),
    '../report/index.html.ejs');
  let template = fs.readFileSync(templateFn, 'utf-8');
  let compiledTemplate = l.template(template);
  let html = compiledTemplate({report: JSON.stringify(data, null, 2)});
  fs.writeFileSync(
    reportFilename,
    html,
    {encoding: 'utf-8', flag: 'w'});
  console.log('Report generated: %s', reportFilename);

  if (!options.output) {
    openfile(reportFilename);
  }
}
