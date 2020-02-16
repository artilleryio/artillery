/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const path = require('path');
const fs = require('fs');

const _ = require('lodash');
const async = require('async');
const csv = require('csv-parse');
const moment = require('moment');
const chalk = require('chalk');

const debug = require('debug')('commands:run');
const defaultOptions = require('rc')('artillery');
const validate = require('../dispatcher').validate;
const createRunner = process.env.MULTICORE
  ? require('../runner')
  : require('../runner-sp');
const createConsoleReporter = require('../../console-reporter');

const {
  readScript,
  parseScript,
  prepareConfig,
  addOverrides,
  addVariables,
  checkConfig
} = require('../../util');

module.exports = run;

module.exports.getConfig = function(callback) {
  let commandConfig = {
    name: 'run',
    command: 'run <script>',
    description: 'Run a test script. Example: `artillery run benchmark.json`',
    options: [
      ['-t, --target <url>', 'Set target URL'],
      ['-p, --payload <path>', 'Set payload file (CSV)'],
      [
        '-o, --output <path>',
        'Set file to write stats to (will output ' + 'to stdout by default)'
      ],
      [
        '-k, --insecure',
        'Allow insecure TLS connections, e.g. with a self-signed cert'
      ],
      ['-e, --environment <name>', 'Specify the environment to be used'],
      ['-c, --config <path>', 'Load test config from a file'],
      [
        '--overrides <JSON>',
        'Object describing parts of the test script to override (experimental)'
      ],
      [
        '-v, --variables <definition>',
        'Set variables for the test dynamically (JSON object)'
      ],
      ['-q, --quiet', 'Do not print anything to stdout']
    ]
  };

  if (callback) {
    return callback(null, commandConfig);
  } else {
    return commandConfig;
  }
};

function run(scriptPath, options) {
  debug('defaultOptions: ', JSON.stringify(defaultOptions, null, 4));

  async.waterfall(
    [
      async.constant(scriptPath),
      readScript,
      parseScript,
      function(script, callback) {
        return callback(null, script, scriptPath, options);
      },
      prepareConfig,
      addOverrides,
      addVariables,
      checkConfig,
      checkTimersBug,
      checkIfXPathIsUsed,
      readPayload
    ],
    function done(err, script) {
      if (err) {
        console.log(err.message);
        process.exit(1);
      }

      script.config.statsInterval = script.config.statsInterval || 10;

      let runner = createRunner(script, script.payload, {
        environment: options.environment,
        // This is used in the worker to resolve
        // the path to the processor module
        scriptPath: scriptPath,
        plugins: defaultOptions.plugins || []
      });
      let intermediates = [];

      // This is where the default console output is produced:
      const consoleReporter = createConsoleReporter(runner.events, {
        quiet: options.quiet || false
      });

      let reporters = [consoleReporter];

      if (process.env.CUSTOM_REPORTERS) {
        const customReporterNames = process.env.CUSTOM_REPORTERS.split(',');
        customReporterNames.forEach(function(name) {
          const createReporter = require(name);
          const reporter = createReporter(runner.events, options);
          reporters.push(reporter);
        });
      }

      runner.events.on('phaseStarted', function(phase) {});

      runner.events.on('stats', function(stats) {
        let report = stats.report();
        intermediates.push(report);
      });

      runner.events.on('done', function(allStats) {
        let report = allStats.report();

        delete report.concurrency;
        delete report.pendingRequests;
        delete report.latencies;

        report.phases = _.get(script, 'config.phases', []);

        if (options.output) {
          let logfile = getLogFilename(
            options.output,
            defaultOptions.logFilenameFormat
          );
          if (!options.quiet) {
            console.log('Log file: %s', logfile);
          }
          fs.writeFileSync(
            logfile,
            JSON.stringify(
              {
                aggregate: report,
                intermediate: intermediates
              },
              null,
              2
            ),
            { flag: 'w' }
          );
        }

        if (script.config.ensure && typeof process.env.ARTILLERY_DISABLE_ENSURE === 'undefined') {
          const latency = report.latency;
          _.each(script.config.ensure, function(max, k) {
            let bucket = k === 'p50' ? 'median' : k;
            if (latency[bucket]) {
              if (latency[bucket] > max) {
                if (!options.quiet) {
                  console.log(chalk.red(`ensure condition failed: ensure.${bucket} < ${max}`));
                }
                process.exit(1);
              }
            }
          });

          if (typeof script.config.ensure.maxErrorRate !== 'undefined') {
            const failRate = Math.round((report.scenariosCreated - report.scenariosCompleted) / report.scenariosCreated * 100);

            if (failRate > script.config.ensure.maxErrorRate) {
              if (!options.quiet) {
                console.log(chalk.red(`ensure condition failed: ensure.maxErrorRate <= ${script.config.ensure.maxErrorRate}`));
              }
              process.exit(1);
            }
          }
        }

        gracefulShutdown();
      });

      runner.run();

      let shuttingDown = false;
      process.once('SIGINT', gracefulShutdown);
      process.once('SIGTERM', gracefulShutdown);

      function gracefulShutdown() {
        debug(`shutting down 🦑`);
        if (shuttingDown) {
          return;
        }

        debug('Graceful shutdown initiated');

        shuttingDown = true;

        runner.shutdown(function() {
          async.eachSeries(
            reporters,
            function(r, nextSeries) {
              if (r.cleanup) {
                r.cleanup(function(cleanupErr) {
                  if (cleanupErr) {
                    debug(cleanupErr);
                  }
                  return nextSeries(null);
                });
              } else {
                process.nextTick(function() {
                  return nextSeries(null);
                });
              }
            },
            function done() {
              debug('All done');
              process.exit(0);
            }
          );
        });
      }
    }
  );
}

function validateSchema(script, callback) {
  let validation = validate(script);
  if (!validation.valid) {
    console.log(validation.errors);
    return callback(new Error('Test script validation error'));
  }
  return callback(null, script);
}

function readPayload(script, callback) {
  async.map(
    script.config.payload,
    function readPayloadFile(payloadSpec, next) {
      let data = fs.readFileSync(payloadSpec.path, 'utf-8');
      let csvOpts = {
        skip_empty_lines: typeof payloadSpec.skipEmptyLines === 'undefined' ? true : payloadSpec.skipEmptyLines,
        cast: typeof payloadSpec.cast === 'undefined' ? true : payloadSpec.cast,
        from_line: payloadSpec.skipHeader === true ? 2 : 1,
        delimiter: payloadSpec.delimiter || ','
      };
      // Defaults may still be overridden:
      csvOpts = Object.assign(csvOpts, payloadSpec.options);
      csv(data, csvOpts, function(err, parsedData) {
        payloadSpec.data = parsedData;
        return next(err, payloadSpec);
      });
    },
    function done(err, results) {
      if (err) {
        return callback(err, script);
      }
      script.payload = results;
      return callback(null, script);
    }
  );
}

function checkTimersBug(script, callback) {
  // Node.js versions 6.8.1 - 7.2.0 have a bug which can cause the process
  // to hang when rampTo is used.
  // Ref: https://github.com/shoreditch-ops/artillery/issues/210

  // 6.8.1 and 7.0.0 and 7.2.0 but NOT 6.8.0
  let nv = process.version;
  let mj = parseInt(nv.substring(1, 2), 10);
  let mn = parseInt(nv.substring(3, 4), 10);
  let pt = parseInt(nv.substring(5, 6), 10);
  if (
    (mj === 7 && mn < 3) ||
    (mj === 6 && mn > 8) ||
    (mj === 6 && mn === 8 && pt > 0)
  ) {
    let usesRampTo = _.some(script.config.phases, function(phase) {
      return !_.isUndefined(phase.rampTo);
    });

    if (usesRampTo) {
      console.error(
        chalk.bold.red(`
You are running Node.js ${nv} which is affected by a bug that can cause
Artillery to hang indefinitely when a rampTo arrival phase is used.

Use Node.js v6.8.0 or lower to avoid the issue.

For more details see: https://github.com/nodejs/node/issues/9756
`)
      );
    }
  }

  return callback(null, script);
}

function checkIfXPathIsUsed(script, callback) {
  let xmlInstalled = null;
  try {
    xmlInstalled = require('artillery-xml-capture');
  } catch (e) {}

  let usesXPathCapture = false;
  script.scenarios.forEach(function(scenario) {
    scenario.flow.forEach(function(step) {
      let params = step[_.keys(step)[0]];
      if (
        (params.capture && params.capture.xpath) ||
        (params.match && params.match.xpath)
      ) {
        usesXPathCapture = true;
      }
    });
  });
  if (usesXPathCapture && !xmlInstalled) {
    console.log(
      chalk.bold.red('Warning: '),
      chalk.bold.yellow(
        'your test script is using XPath capture, but artillery-xml-capture does not seem to be installed.'
      )
    );
    console.log(
      chalk.bold.yellow('Install it with: npm install -g artillery-xml-capture')
    );
  }
  return callback(null, script);
}

function getLogFilename(output, userDefaultFilenameFormat) {
  let logfile;

  // is the destination a directory that exists?
  let isDir = false;
  if (output) {
    try {
      isDir = fs.statSync(output).isDirectory();
    } catch (err) {
      // ENOENT, don't need to do anything
    }
  }

  const defaultFormat = '[artillery_report_]YMMDD_HHmmSS[.json]';
  if (!isDir && output) {
    // -o is set with a filename (existing or not)
    logfile = output;
  } else if (!isDir && !output) {
    // no -o set
  } else {
    // -o is set with a directory
    logfile = path.join(
      output,
      moment().format(userDefaultFilenameFormat || defaultFormat)
    );
  }

  return logfile;
}
