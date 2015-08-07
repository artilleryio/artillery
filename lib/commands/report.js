'use strict';

var fs = require('fs');
var path = require('path');
var l = require('lodash');
var openfile = require('open');

module.exports = report;

function report(jsonReportPath) {
  var data = JSON.parse(fs.readFileSync(jsonReportPath, 'utf-8'));
  var templateFn = path.join(
    path.dirname(__filename),
    '../report/index.html.ejs');
  var template = fs.readFileSync(templateFn, 'utf-8');
  var compiledTemplate = l.template(template);
  var html = compiledTemplate({report: JSON.stringify(data, null, 2)});
  var reportFilename = jsonReportPath + '.html';
  fs.writeFileSync(
    reportFilename,
    html,
    {encoding: 'utf-8', flag: 'w'});
  console.log('Report generated: %s', reportFilename);
  openfile(reportFilename);
}
