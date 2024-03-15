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
const SSMS = require('@artilleryio/int-core').ssms.SSMS;

module.exports = createConsoleReporter;

function createConsoleReporter(events, opts) {
  const reporter = new ConsoleReporter(opts);
  events.on('phaseStarted', reporter.phaseStarted.bind(reporter));
  events.on('phaseCompleted', reporter.phaseCompleted.bind(reporter)); // TODO: Not firing - event not propagating?
  events.on('stats', reporter.stats.bind(reporter));
  events.on('done', reporter.done.bind(reporter));
  reporter.start();
  return reporter;
}

function ConsoleReporter(opts) {
  this.opts = opts || {};
  this.outputFormat = opts.outputFormat || process.env.OUTPUT_FORMAT || 'new';

  this.quiet = opts.quiet;
  this.metricsToSuppress = opts.metricsToSuppress;
  this.spinner = ora({
    spinner: 'dots'
  });
  this.spinner.start();

  this.reportScenarioLatency = !!opts.reportScenarioLatency;
  this.startTime = null;

  let self = this;

  global.artillery.globalEvents.on('log', (opts, ...args) => {
    let logger;
    if (typeof opts.level !== 'undefined' && opts.level !== 'info') {
      logger = console.error;
    } else {
      logger = console.log;
    }

    if (opts.showTimestamp) {
      args.push(chalk.gray('[' + moment().format('HH:mm:ss') + ']'));
    }

    this.spinner.clear();
    logger.apply(console, [...args]);
    this.spinner.start();
  });

  return this;
}

ConsoleReporter.prototype.cleanup = function (done) {
  this.spinner.clear();
  return done(null);
};

ConsoleReporter.prototype.start = function start() {
  if (this.quiet) {
    return this;
  }
  // artillery.log(`Artillery running - ${moment(Date.now()).toISOString()}\n`);
  return this;
};

ConsoleReporter.prototype.phaseStarted = function phaseStarted(phase) {
  if (this.quiet) {
    return this;
  }

  const phaseDuration = phase.duration || phase.pause;
  //only append s when phaseDuration is a number or number-like string (like from env variables). otherwise it's a converted unit (e.g. 5min)
  const durationString = Number.isInteger(_.toNumber(phaseDuration)) ? `${phaseDuration}s` : `${phaseDuration}`;

  artillery.log(
    `Phase started: ${chalk.green(
      phase.name ? phase.name : 'unnamed'
    )} (index: ${phase.index}, duration: ${
      durationString
    }) ${formatTimestamp(new Date())}\n`
  );
};

ConsoleReporter.prototype.phaseCompleted = function phaseCompleted(phase) {
  if (this.quiet) {
    return this;
  }

  const phaseDuration = phase.duration || phase.pause;
  //only append s when phaseDuration is a number or number-like string (like from env variables). otherwise it's a converted unit (e.g. 5min)
  const durationString = Number.isInteger(_.toNumber(phaseDuration)) ? `${phaseDuration}s` : `${phaseDuration}`;

  artillery.log(
    `Phase completed: ${chalk.green(
      phase.name ? phase.name : 'unnamed'
    )} (index: ${phase.index}, duration: ${
      durationString
    }) ${formatTimestamp(new Date())}\n`
  );

  return this;
};

ConsoleReporter.prototype.stats = function stats(data) {
  if (this.quiet) {
    return this;
  }

  if (!this.startTime) {
    this.startTime = data.firstMetricAt || Date.now();
  }

  // NOTE: histograms property is available and contains raw
  // histogram objects
  data.summaries = data.summaries || {};
  data.counters = data.counters || {};
  // data.rates = data.rates || {};

  if (typeof data.report === 'function') {
    // Compatibility fix with Artillery Pro which uses 1.x
    // API for emitting reports to console-reporter.
    // TODO: Remove when support for 1x is dropped in Artillery Pro
    artillery.log(
      `Elapsed time: ${util.formatDuration(Date.now() - this.startTime)}`
    );
    this.printReport(data.report(), this.opts);
  } else {
    this.printReport(data, this.opts);
  }
  artillery.log();
  artillery.log();
};

ConsoleReporter.prototype.done = function done(data) {
  if (this.quiet) {
    return this;
  }

  if (this.startTime !== null) {
    artillery.log(
      `All VUs finished. Total time: ${util.formatDuration(
        Date.now() - this.startTime
      )}\n`
    );
  }

  const txt = `Summary report @ ${formatTimestamp(new Date())}`;
  artillery.log(`${underline(txt)}\n${txt}\n${underline(txt)}\n`);

  // TODO: this is repeated in 'stats' handler
  data.summaries = data.summaries || {};
  data.counters = data.counters || {};

  if (typeof data.report === 'function') {
    // Compatibility fix with Artillery Pro which uses 1.x
    // API for emitting reports to console-reporter.
    // TODO: Remove when support for 1x is dropped in Artillery Pro
    this.printReport(
      data.report(),
      Object.assign({}, this.opts, {
        showScenarioCounts: true,
        printPeriod: false
      })
    );
  } else {
    this.printReport(
      data,
      Object.assign({}, this.opts, {
        showScenarioCounts: true,
        printPeriod: false
      })
    );
  }
};

ConsoleReporter.prototype.printReport = function printReport(report, opts) {
  opts = opts || {};
  if (opts.printPeriod !== false) {
    const timeWindowEnd = moment(
      new Date(Number(report.period) + 10 * 1000)
    ).format('HH:mm:ss(ZZ)');
    if (typeof report.period !== 'undefined') {
      // FIXME: up to bound should be included in the report
      // Add underline
      const txt = 'Metrics for period to: ' + timeWindowEnd;
      artillery.log(
        underline(txt) +
          '\n' +
          txt +
          ' ' +
          chalk.gray(
            '(width: ' +
              (report.lastMetricAt - report.firstMetricAt) / 1000 +
              's)'
          ) +
          '\n' +
          underline(txt) +
          '\n'
      );

      // artillery.log(padded('time_window:', timeWindowEnd));
    } else {
      artillery.log('Report @ %s', formatTimestamp(report.timestamp));
    }
  }

  if (this.outputFormat === 'new') {
    report.rates = report.rates || {};
    report.counters = report.counters || {};
    report.summaries = report.summaries || {};

    const sortedByLen = _(
      Object.keys(report.summaries)
        .concat(Object.keys(report.counters))
        .concat(Object.keys(report.rates))
    )
      .sortBy([(x) => x.length])
      .value();

    if (sortedByLen.length == 0) {
      // No scenarios launched or completed, no requests made or completed etc. Nothing happened.
      artillery.log('No measurements recorded during this period');
      return;
    }

    const sortedAlphabetically = sortedByLen.sort();

    let result = [];
    for (const metricName of sortedAlphabetically) {

      if (shouldSuppressOutput(metricName, this.metricsToSuppress)) {
        continue;
      };
      if (typeof report.counters?.[metricName] !== 'undefined') {
        result = result.concat(printCounters([metricName], report));
      }
      if (typeof report.summaries?.[metricName] !== 'undefined') {
        result = result.concat(printSummaries([metricName], report));
      }
      if (typeof report.rates?.[metricName] !== 'undefined') {
        result = result.concat(printRates([metricName], report));
      }
    }

    artillery.log(result.join('\n'));
  }
};

if (this.outputFormat === 'classic') {
  report = SSMS.legacyReport(report).report();

  // TODO: Read new fields instead of the old ones

  artillery.log('Scenarios launched:  %s', report.scenariosCreated);
  artillery.log('Scenarios completed: %s', report.scenariosCompleted);
  artillery.log('Requests completed:  %s', report.requestsCompleted);

  artillery.log('Mean responses/sec: %s', report.rps.mean);
  artillery.log('Response time (msec):');
  artillery.log('  min: %s', report.latency.min);
  artillery.log('  max: %s', report.latency.max);
  artillery.log('  median: %s', report.latency.median);
  artillery.log('  p95: %s', report.latency.p95);
  artillery.log('  p99: %s', report.latency.p99);

  if (this.reportScenarioLatency) {
    artillery.log('Scenario duration:');
    artillery.log('  min: %s', report.scenarioDuration.min);
    artillery.log('  max: %s', report.scenarioDuration.max);
    artillery.log('  median: %s', report.scenarioDuration.median);
    artillery.log('  p95: %s', report.scenarioDuration.p95);
    artillery.log('  p99: %s', report.scenarioDuration.p99);
  }

  // We only want to show this for the aggregate report:
  if (opts.showScenarioCounts && report.scenarioCounts) {
    artillery.log('Scenario counts:');
    _.each(report.scenarioCounts, function (count, name) {
      let percentage =
        Math.round((count / report.scenariosCreated) * 100 * 1000) / 1000;
      artillery.log('  %s: %s (%s%)', name, count, percentage);
    });
  }

  if (_.keys(report.codes).length !== 0) {
    artillery.log('Codes:');
    _.each(report.codes, function (count, code) {
      artillery.log('  %s: %s', code, count);
    });
  }
  if (_.keys(report.errors).length !== 0) {
    artillery.log('Errors:');
    _.each(report.errors, function (count, code) {
      artillery.log('  %s: %s', code, count);
    });
  }

  if (_.size(report.summaries) > 0 || _.size(report.counters) > 0) {
    _.each(report.summaries, function (r, n) {
      if (excludeFromReporting(n)) return;

      artillery.log('%s:', n);
      artillery.log('  min: %s', r.min);
      artillery.log('  max: %s', r.max);
      artillery.log('  median: %s', r.median);
      artillery.log('  p95: %s', r.p95);
      artillery.log('  p99: %s', r.p99);
    });
  }

  _.each(report.customStats, function (r, n) {
    artillery.log('%s:', n);
    artillery.log('  min: %s', r.min);
    artillery.log('  max: %s', r.max);
    artillery.log('  median: %s', r.median);
    artillery.log('  p95: %s', r.p95);
    artillery.log('  p99: %s', r.p99);
  });

  _.each(report.counters, function (value, name) {
    // Only show user/custom metrics in this mode, but none of the internally generated ones:
    if (excludeFromReporting(name)) return;
    artillery.log('%s: %s', name, value);
  });

  artillery.log();
}

function isCollectionMetric(n) {
  const collectionMetrics = ['artillery.codes', 'errors'];
  return (
    collectionMetrics.filter((m) => {
      return n.startsWith(m);
    }).length > 0
  );
}

if (this.outputFormat === 'table') {
  const t = new Table({ head: ['Metric', 'Value'] });

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

    _.sortBy(
      Object.keys(report.counters).filter((name) => !isCollectionMetric(name))
    ).forEach((name) => {
      const value = report.counters[name];
      t.push([name, value]);
    });
  }
  artillery.log(t.toString());
  artillery.log();
}

// TODO: Make smarter if date changes, ie. test runs over midnight
function formatTimestamp(timestamp) {
  return moment(new Date(timestamp)).format('HH:mm:ss(ZZ)');
}

function underline(text) {
  return '-'.repeat(text.length);
}

function excludeFromReporting(name) {
  return (
    ['engine', 'core', 'artillery', 'errors', 'scenarios'].indexOf(
      name.split('.')[0]
    ) > -1
  );
}

function padded(str1, str2) {
  const defaultWidth = 79;
  // We need at least 50
  const columnsAvailable = Math.max(
    process.stdout?.columns || defaultWidth,
    50
  );
  // But no more than 79:
  const width = Math.min(columnsAvailable, defaultWidth);

  return util.padded(str1, str2, width);
}

function printRates(rates, report) {
  return rates.sort().map((name) => {
    return padded(`${name}:`, report.rates[name]) + '/sec';
  });
}

function printCounters(counters, report) {
  return counters.sort().map((name) => {
    const value = report.counters[name];
    return padded(`${name}:`, value);
  });
}

function printSummaries(summaries, report) {
  const result = [];
  for (const n of summaries) {
    const r = report.summaries[n];
    result.push(`${n}:`);
    result.push(padded('  min:', r.min));
    result.push(padded('  max:', r.max));
    result.push(padded('  mean:', r.mean));
    result.push(padded('  median:', r.median));
    result.push(padded('  p95:', r.p95));
    result.push(padded('  p99:', r.p99));

    // TODO: Can work well if padded to look like a table:
    // result.push(padded(`${trimName(n)}:`, `min: ${r.min} | max: ${r.max} | p50: ${r.p50} | p95: ${r.p95} | p99: ${r.p99}`));
  }
  return result;
}

function shouldSuppressOutput(currMetricName, suppressMetricsList) {
  if (!suppressMetricsList) {
    return;
  };
  return suppressMetricsList.some((metric)=> currMetricName.includes(metric));
}
