/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const ora = require('ora');
const _ = require('lodash');
const moment = require('moment');
const chalk = require('chalk');
const Table = require('cli-table3');
const util = require('./util');

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
  this.outputFormat = opts.outputFormat || process.env.OUTPUT_FORMAT || 'new';

  this.quiet = opts.quiet;
  this.spinner = ora({
    spinner: 'line',
  });
  this.spinnerOn = false;
  this.reportScenarioLatency = !!opts.reportScenarioLatency;
  this.startTime = Date.now();

  // High CPU usage warning state:
  this.lastWarningAt = Date.now();
  this.alreadyWarned = false;

  return this;
}

ConsoleReporter.prototype.cleanup = function(done) {
  return done(null);
};

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
  console.log(`Time: ${formatTimestamp(report.timestamp)}`);
  console.log(`Elapsed time: ${util.formatDuration(Date.now() - this.startTime)}`);
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
            `\nCPU usage of Artillery seems to be very high (pids: ${busyPids.join(',')})\nwhich may severely affect its performance.\nSee https://artillery.io/docs/faq/#high-cpu-warnings for details.\n`
          )
        );
        this.alreadyWarned = true;
      } else {
        console.log(
          chalk.black.bgYellow.bold('Warning:'),
          chalk.yellow(
            `High CPU usage warning (pids: ${busyPids.join(',')}).\nSee https://artillery.io/docs/faq/#high-cpu-warnings for details.\n`
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
  console.log(`Total time: ${util.formatDuration(Date.now() - this.startTime)}`);

  delete report.concurrency;
  this.printReport(report, {
    showScenarioCounts: true
  });
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

  if (this.outputFormat === 'new') {
    // TODO: Order the metrics: core, engine, plugins, user

    const sortedByLen = _(
      Object.keys(report.summaries).concat(Object.keys(report.counters))
    ).sortBy([(x) => x.length]).value();

    if (sortedByLen.length == 0) {
      // No scenarios launched or completed, no requests made or completed etc. Nothing happened.
      // TODO: Let the user know rather than printing nothing.
      return;
    }

    const totalLength = sortedByLen[sortedByLen.length - 1].length + 10;

    function padded(str1, str2) {
      return str1 + ' ' + chalk.gray('.'.repeat(totalLength - str1.length)) + ' ' + str2;
    }
    
    function trimName(name) {
      if (name.startsWith('core.')) {
        return name.slice(5);
      }
      if (name.startsWith('engine.')) {
        return name.slice(7)
      }

      return name;
    }

    // TODO: Take rate metric names into account for padding
    _.each(report.rates, (count, name) => {
      console.log(padded(`  ${trimName(name)}:`, count) + '/sec avg');
    });

    const coreCounters = Object.keys(report.counters).filter(name => name.startsWith('core.'));
    const engineCounters = Object.keys(report.counters).filter(name => name.startsWith('engine.'));
    const otherCounters = Object.keys(report.counters).filter(name => coreCounters.indexOf(name) === -1 && engineCounters.indexOf(name) === -1);

    [coreCounters, engineCounters, otherCounters].forEach((coll) => {
      coll.forEach(function(name) {
        const value = report.counters[name];
        console.log(padded(`  ${trimName(name)}:`, value));
      });
    });

    const coreSummaries = Object.keys(report.summaries).filter(name => name.startsWith('core.'));
    const engineSummaries = Object.keys(report.summaries).filter(name => name.startsWith('engine.'));
    const otherSummaries = Object.keys(report.summaries).filter(name => coreSummaries.indexOf(name) === -1 && engineSummaries.indexOf(name) === -1);

    [coreSummaries, engineSummaries, otherSummaries].forEach((coll) => {
      coll.forEach((n) => {
        const r = report.summaries[n];
        console.log(`  ${trimName(n)}:`);
        console.log(padded('    min:', r.min));
        console.log(padded('    max:', r.max));
        console.log(padded('    median:', r.median));
        console.log(padded('    p95:', r.p95));
        console.log(padded('    p99:', r.p99));
      });
    });

    console.log();
    console.log();
  }

  if (this.outputFormat === 'classic') {
    // TODO: Read new fields instead of the old ones

    console.log('  Scenarios launched:  %s', report.scenariosCreated);
    console.log('  Scenarios completed: %s', report.scenariosCompleted);
    console.log('  Requests completed:  %s', report.requestsCompleted);

    // Final report does not have concurrency
    if (report.concurrency) {
      console.log('  Concurrent users:   %s', report.concurrency);
    }

    console.log('  Mean responses/sec: %s', report.rps.mean);
    console.log('  Request time (msec):');
    console.log('    min: %s', report.latency.min);
    console.log('    max: %s', report.latency.max);
    console.log('    median: %s', report.latency.median);
    console.log('    p95: %s', report.latency.p95);
    console.log('    p99: %s', report.latency.p99);

    if (this.reportScenarioLatency) {
      console.log('  Scenario duration:');
      console.log('    min: %s', report.scenarioDuration.min);
      console.log('    max: %s', report.scenarioDuration.max);
      console.log('    median: %s', report.scenarioDuration.median);
      console.log('    p95: %s', report.scenarioDuration.p95);
      console.log('    p99: %s', report.scenarioDuration.p99);
    }

    // We only want to show this for the aggregate report:
    if (opts.showScenarioCounts && report.scenarioCounts) {
      console.log('  Scenario counts:');
      _.each(report.scenarioCounts, function(count, name) {
        let percentage =
            Math.round(count / report.scenariosCreated * 100 * 1000) / 1000;
        console.log('    %s: %s (%s%)', name, count, percentage);
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

    function excludeFromReporting(name) {
      return ['engine', 'core', 'artillery', 'errors', 'scenarios'].indexOf(name.split('.')[0]) > -1;
    }

    if (_.size(report.summaries) > 0 || _.size(report.counters) > 0) {
      _.each(report.summaries, function(r, n) {
        if (excludeFromReporting(n)) return;

        console.log('%s:', n);
        console.log('  min: %s', r.min);
        console.log('  max: %s', r.max);
        console.log('  median: %s', r.median);
        console.log('  p95: %s', r.p95);
        console.log('  p99: %s', r.p99);
      });
    }

    _.each(report.counters, function(value, name) {
      // Only show user/custom metrics in this mode, but none of the internally generated ones:
      if (excludeFromReporting(name)) return;
      console.log('%s: %s', name, value);
      });

    console.log();
  }

  function isCollectionMetric(n) {
    const collectionMetrics = ['artillery.codes', 'errors'];
    return collectionMetrics.filter((m) => {
      return n.startsWith(m);
    }).length > 0;
  }

  if (this.outputFormat === 'table') {
    const t = new Table({head: ['Metric', 'Value']});

    if (_.size(report.summaries) > 0 || _.size(report.counters) > 0) {

      _.sortBy(Object.keys(report.summaries)).forEach((n) => {
        const r = report.summaries[n];
        const spaces = ' '.repeat(Math.min(8, n.length + 1));
        t.push([`${n}`]);
        t.push([`${spaces}min`, r.min]);
        t.push([`${spaces}max`, r.max]);
        t.push([`${spaces}median`, r.median]);
        t.push([`${spaces}p95`, r.p95]);
        t.push([`${spaces}p99`, r.p99]);
      });

      _.sortBy(Object.keys(report.counters).filter((name) => !isCollectionMetric(name))).forEach((name) => {
        const value = report.counters[name];
        t.push([name, value]);
      });
    }
    console.log(t.toString());
    console.log();
  }
};

function formatTimestamp(timestamp) {
  return moment(new Date(timestamp)).format('HH:mm:ss(ZZ) YYYY-MM-DD');
}
