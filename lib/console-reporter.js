/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const ora = require('ora');
const _ = require('lodash');
const moment = require('moment');
const chalk = require('chalk');

module.exports = createConsoleReporter;

function createConsoleReporter(events, opts) {
  const reporter = new ConsoleReporter(opts);
  events.on('phaseStarted', reporter.phaseStarted.bind(reporter));
  events.on('stats', reporter.stats.bind(reporter));
  events.on('highcpu', reporter.highcpu.bind(reporter));
  events.on('done', reporter.done.bind(reporter));
  reporter.start();
  return reporter;
}

function ConsoleReporter(opts) {
  opts = opts || {};
  this.quiet = opts.quiet;
  this.spinner = ora();
  this.spinnerOn = false;

  // High CPU usage warning state:
  this.lastWarningAt = Date.now();
  this.alreadyWarned = false;

  return this;
}

ConsoleReporter.prototype.start = function start() {
  if (this.quiet) {
    return this;
  }
  return this.toggleSpinner();
};

ConsoleReporter.prototype.phaseStarted = function phaseStarted(phase) {
  if (this.quiet) {
    return this;
  }
  this.toggleSpinner();
  console.log(
    'Started phase %s%s, duration: %ss @ %s',
    phase.index,
    phase.name ? ' (' + phase.name + ')' : '',
    phase.duration || phase.think,
    formatTimestamp(new Date())
  );
  this.toggleSpinner();
};

ConsoleReporter.prototype.stats = function stats(data) {
  if (this.quiet) {
    return this;
  }
  const report = data.report();
  this.toggleSpinner();
  console.log('Report @ %s', formatTimestamp(report.timestamp));
  this.printReport(report);
  this.toggleSpinner();
};

ConsoleReporter.prototype.highcpu = function(busyPids) {
  if (!process.env.ARTILLERY_DISABLE_CPU_MONITORING) {
    if (Date.now() - this.lastWarningAt > 10 * 1000) {
      this.toggleSpinner();

      if (!this.alreadyWarned) {
        console.log(
          chalk.black.bgYellow.bold('Warning:'),
          chalk.yellow(
            '\nCPU usage of Artillery seems to be very high\nwhich may severely affect its performance.\nSee https://artillery.io/docs/faq/#high-cpu-warnings for details.\n'
          )
        );
        this.alreadyWarned = true;
      } else {
        console.log(
          chalk.black.bgYellow.bold('Warning:'),
          chalk.yellow(
            'High CPU usage warning.\nSee https://artillery.io/docs/faq/#high-cpu-warnings for details.\n'
          )
        );
      }

      this.lastWarningAt = Date.now();
      this.toggleSpinner();
    }
  }
};

ConsoleReporter.prototype.done = function done(data) {
  if (this.quiet) {
    return this;
  }
  const report = data.report();
  this.toggleSpinner();
  console.log('All virtual users finished');
  console.log('Summary report @ %s', formatTimestamp(report.timestamp));
  this.printReport(report, { showScenarioCounts: true });
};

ConsoleReporter.prototype.toggleSpinner = function toggleSpinner() {
  if (this.spinnerOn) {
    this.spinner.stop();
  } else {
    this.spinner.start();
  }
  this.spinnerOn = !this.spinnerOn;
  return this;
};

ConsoleReporter.prototype.printReport = function printReport(report, opts) {
  opts = opts || {};

  console.log('Users created: %s', report.scenariosCreated);
  console.log('Users completed: %s', report.scenariosCompleted);
//  console.log('Completed requests:  %s', report.requestsCompleted);

  // Final report does not have concurrency
  if (report.concurrency) {
    console.log(`Concurrent users: ${report.concurrency}`);
  }

  console.log(`Scenario time (ms) - min: ${report.scenarioDuration.min} / max: ${report.scenarioDuration.max} / median: ${report.scenarioDuration.median} / p95: ${report.scenarioDuration.p95} / p99: ${report.scenarioDuration.p99}`);

  //
  // Engine-level stats:
  //
  console.log(`RPS sent: ${report.rps.mean}`);
  console.log(
    `Response time (ms) - min: ${report.latency.min} / max: ${report.latency
      .max} / median: ${report.latency.median} / p95: ${report.latency
      .p95} / p99: ${report.latency.p99}`
  );

  // We only want to show this for the aggregate report
  if (opts.showScenarioCounts && report.scenarioCounts) {
    console.log('Scenario counts:');
    _.each(report.scenarioCounts, function(count, name) {
      let percentage =
        Math.round(count / report.scenariosCreated * 100 * 1000) / 1000;
      console.log('  %s: %s (%s%)', name, count, percentage);
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
    console.log('Codes:');
    _.each(report.codes, function(count, code) {
      console.log('  %s: %s', code, count);
    });
  }
  if (_.keys(report.errors).length !== 0) {
    console.log('Errors:');
    _.each(report.errors, function(count, code) {
      console.log('  %s: %s', code, count);
    });
  }

  console.log();
};

function formatTimestamp(timestamp) {
  return moment(new Date(timestamp)).format('HH:mm:ss(ZZ) YYYY-MM-DD');
}
