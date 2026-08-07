/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import chalk from 'chalk';
import _ from 'lodash';
import moment from 'moment';
import ora from 'ora';

import Table from 'cli-table3';
import * as util from './util.ts';

export default createConsoleReporter;

// Metric report data as delivered to the reporter: a PeriodMetrics
// object with summaries attached, or a legacy 1.x report object
// exposing report(). Kept structural until the reporting model is
// consolidated.
type ReportData = Record<string, any>;

export interface ConsoleReporterOpts {
  outputFormat?: string;
  quiet?: boolean;
  metricsToSuppress?: string[];
  reportScenarioLatency?: boolean;
  printPeriod?: boolean;
  showScenarioCounts?: boolean;
  [key: string]: any;
}

function createConsoleReporter(
  events: { on(event: string, listener: (...args: any[]) => void): unknown },
  opts?: ConsoleReporterOpts
) {
  const reporter = new ConsoleReporter(opts);
  events.on('phaseStarted', reporter.phaseStarted.bind(reporter));
  events.on('phaseCompleted', reporter.phaseCompleted.bind(reporter)); // TODO: Not firing - event not propagating?
  events.on('stats', reporter.stats.bind(reporter));
  events.on('done', reporter.done.bind(reporter));
  reporter.start();
  return reporter;
}

class ConsoleReporter {
  declare opts: ConsoleReporterOpts;
  declare outputFormat: string;
  declare quiet: boolean | undefined;
  declare metricsToSuppress: string[] | undefined;
  declare spinner: ReturnType<typeof ora>;
  declare reportScenarioLatency: boolean;
  declare startTime: number | null;

  constructor(opts?: ConsoleReporterOpts) {
    this.opts = opts || {};
    this.outputFormat =
      this.opts.outputFormat || process.env.OUTPUT_FORMAT || 'new';

    this.quiet = this.opts.quiet;
    this.metricsToSuppress = this.opts.metricsToSuppress;
    this.spinner = ora({
      spinner: 'dots'
    });
    this.spinner.start();

    this.reportScenarioLatency = !!this.opts.reportScenarioLatency;
    this.startTime = null;

    global.artillery.globalEvents.on(
      'log',
      (opts: Record<string, any>, ...args: unknown[]) => {
        let logger;
        if (typeof opts.level !== 'undefined' && opts.level !== 'info') {
          logger = console.error;
        } else {
          logger = console.log;
        }

        if (opts.showTimestamp) {
          args.push(chalk.gray(`[${moment().format('HH:mm:ss')}]`));
        }

        this.spinner.clear();
        logger.apply(console, [...args]);
        this.spinner.start();
      }
    );
  }

  cleanup(done: (err: Error | null) => void) {
    this.spinner.clear();
    return done(null);
  }

  start() {
    if (this.quiet) {
      return this;
    }
    // artillery.log(`Artillery running - ${moment(Date.now()).toISOString()}\n`);
    return this;
  }

  phaseStarted(phase: Record<string, any>) {
    if (this.quiet) {
      return this;
    }

    const phaseDuration = phase.duration || phase.pause;
    //only append s when phaseDuration is a number or number-like string (like from env variables). otherwise it's a converted unit (e.g. 5min)
    const durationString = Number.isInteger(_.toNumber(phaseDuration))
      ? `${phaseDuration}s`
      : `${phaseDuration}`;

    artillery.log(
      `Phase started: ${chalk.green(
        phase.name ? phase.name : 'unnamed'
      )} (index: ${phase.index}, duration: ${durationString}) ${formatTimestamp(
        new Date()
      )}\n`
    );
    return this;
  }

  phaseCompleted(phase: Record<string, any>) {
    if (this.quiet) {
      return this;
    }

    const phaseDuration = phase.duration || phase.pause;
    //only append s when phaseDuration is a number or number-like string (like from env variables). otherwise it's a converted unit (e.g. 5min)
    const durationString = Number.isInteger(_.toNumber(phaseDuration))
      ? `${phaseDuration}s`
      : `${phaseDuration}`;

    artillery.log(
      `Phase completed: ${chalk.green(
        phase.name ? phase.name : 'unnamed'
      )} (index: ${phase.index}, duration: ${durationString}) ${formatTimestamp(
        new Date()
      )}\n`
    );

    return this;
  }

  stats(data: ReportData) {
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
        `Elapsed time: ${util.formatDuration(
          Date.now() - (this.startTime as number)
        )}`
      );
      this.printReport(data.report(), this.opts);
    } else {
      this.printReport(data, this.opts);
    }
    artillery.log();
    artillery.log();
    return this;
  }

  done(data: ReportData) {
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
    return this;
  }

  printReport(report: ReportData, opts?: ConsoleReporterOpts) {
    opts = opts || {};
    if (opts.printPeriod !== false) {
      const timeWindowEnd = moment(
        new Date(Number(report.period) + 10 * 1000)
      ).format('HH:mm:ss(ZZ)');
      if (typeof report.period !== 'undefined') {
        // FIXME: up to bound should be included in the report
        // Add underline
        const txt = `Metrics for period to: ${timeWindowEnd}`;
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

      if (sortedByLen.length === 0) {
        // No scenarios launched or completed, no requests made or completed etc. Nothing happened.
        artillery.log('No measurements recorded during this period');
        return;
      }

      const sortedAlphabetically = sortedByLen.sort();

      let result: string[] = [];
      for (const metricName of sortedAlphabetically) {
        if (shouldSuppressOutput(metricName, this.metricsToSuppress)) {
          continue;
        }
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
  }
}

// TODO: Make smarter if date changes, ie. test runs over midnight
function formatTimestamp(timestamp: number | string | Date) {
  return moment(new Date(timestamp)).format('HH:mm:ss(ZZ)');
}

function underline(text: string) {
  return '-'.repeat(text.length);
}

function padded(str1: string, str2: string | number) {
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

function printRates(rates: string[], report: ReportData) {
  return rates.sort().map((name) => {
    return `${padded(`${name}:`, report.rates[name])}/sec`;
  });
}

function printCounters(counters: string[], report: ReportData) {
  return counters.sort().map((name) => {
    const value = report.counters[name];
    return padded(`${name}:`, value);
  });
}

function printSummaries(summaries: string[], report: ReportData) {
  const result: string[] = [];
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

function shouldSuppressOutput(
  currMetricName: string,
  suppressMetricsList: string[] | undefined
) {
  if (!suppressMetricsList) {
    return false;
  }
  return suppressMetricsList.some((metric) => currMetricName.includes(metric));
}
