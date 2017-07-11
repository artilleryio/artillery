/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const cli = require('cli');
const _ = require('lodash');

module.exports = ConsoleReporter;

function ConsoleReporter (opts) {
  this.isTTY = process.stdout.isTTY;
  this.spinnerOn = false;
  return this;
}

ConsoleReporter.prototype.start = function start () {
  return this.toggleSpinner();
};

ConsoleReporter.prototype.phaseStarted = function phaseStarted (phase) {
  this.toggleSpinner();
  console.log(
    'Started phase %s%s, duration: %ss',
    phase.index,
    (phase.name ? ' (' + phase.name + ')' : ''),
    phase.duration || phase.think);
  this.toggleSpinner();
};

ConsoleReporter.prototype.stats = function stats (report) {
  this.toggleSpinner();
  console.log('Report @ %s', report.timestamp);
  this.printReport(report);
  this.toggleSpinner();
};

ConsoleReporter.prototype.done = function done (report) {
  this.toggleSpinner();
  console.log('All virtual users finished');
  console.log('Summary report @ %s', report.timestamp);
  this.printReport(report, { showScenarioCounts: true });
};

ConsoleReporter.prototype.toggleSpinner = function toggleSpinner() {
  if (!this.isTTY) {
    return this;
  }

  if (this.spinnerOn) {
    cli.spinner('', true);
  } else {
    cli.spinner('');
  }
  this.spinnerOn = !this.spinnerOn;
  return this;
};

ConsoleReporter.prototype.printReport = function printReport(report, opts) {
  opts = opts || {};

  console.log('  Scenarios launched:  %s', report.scenariosCreated);
  console.log('  Scenarios completed: %s', report.scenariosCompleted);
  console.log('  Requests completed:  %s', report.requestsCompleted);

  // Final report does not have concurrency
  if (report.concurrency) {
    console.log('  Concurrent users:    %s', report.concurrency);
  }

  console.log('  RPS sent: %s', report.rps.mean);
  console.log('  Request latency:');
  console.log('    min: %s', report.latency.min);
  console.log('    max: %s', report.latency.max);
  console.log('    median: %s', report.latency.median);
  console.log('    p95: %s', report.latency.p95);
  console.log('    p99: %s', report.latency.p99);

  console.log('  Scenario duration:');
  console.log('    min: %s', report.scenarioDuration.min);
  console.log('    max: %s', report.scenarioDuration.max);
  console.log('    median: %s', report.scenarioDuration.median);
  console.log('    p95: %s', report.scenarioDuration.p95);
  console.log('    p99: %s', report.scenarioDuration.p99);

  // We only want to show this for the aggregate report
  if (opts.showScenarioCounts && report.scenarioCounts) {
    console.log('  Scenario counts:');
    _.each(report.scenarioCounts, function(count, name) {
      let percentage = Math.round(count / report.scenariosCreated * 100 * 1000) / 1000;
      console.log('    %s: %s (%s\%)', name, count, percentage);
    });
  }

  if (_.size(report.customStats) > 0) {
    console.log('Custom stats:');
    _.each(report.customStats, function(r, n) {
      console.log('  %s:', n);
      console.log('    min: %s', r.min);
      console.log('    max: %s', r.max);
      console.log('    median: %s', r.median);
      console.log('    p95: %s', r.p95);
      console.log('    p99: %s', r.p99);
    });
  }

  if (_.keys(report.codes).length !== 0) {
    console.log('  Codes:');
    _.each(report.codes, function(count, code) {
      console.log('    %s: %s', code, count);
    });
  }
  if (_.keys(report.errors).length !== 0) {
    console.log('  Errors:');
    _.each(report.errors, function(count, code) {
      console.log('    %s: %s', code, count);
    });
  }
};
