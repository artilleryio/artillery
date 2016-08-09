/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const _ = require('lodash');
const core = require('artillery-core');
const runner = core.runner;
const Stats = core.stats;
const fs = require('fs');
const path = require('path');
const async = require('async');
const csv = require('csv-parse');
const util = require('util');
const cli = require('cli');
const YAML = require('yamljs');
const defaultOptions = require('rc')('artillery');
const moment = require('moment');
const chalk = require('chalk');

module.exports = run;

function run(scriptPath, options) {

  let logfile;
  if (options.output && options.output !== defaultOptions.output) {
    logfile = options.output;
    if (!logfile.match(/\.json$/)) {
      logfile += '.json';
    }
  } else {
    if (defaultOptions.output) {
      logfile = moment().format(defaultOptions.output);
    } else {
      logfile = moment().format('[artillery_report_]YMMDD_HHmmSS[.json]');
    }
  }

  function log() {
    if (options.quiet) { return; }
    console.log.apply(console, arguments);
  }

  async.waterfall([
    function readScript(callback) {

      fs.readFile(scriptPath, 'utf-8', function(err, data) {

        if (err) {
          const msg = util.format('File not found: %s', scriptPath);
          return callback(new Error(msg), null);
        }

        let script;
        let fileformat;
        try {
          if (/\.ya?ml$/.test(path.extname(scriptPath))) {
            fileformat = 'YAML';
            script = YAML.parse(data);
          } else {
            fileformat = 'JSON';
            script = JSON.parse(data);
          }
        } catch (e) {
          const msg2 = `File ${scriptPath} does not appear to be valid ${fileformat}: (${e.message})`;
          return callback(new Error(msg2), null);
        }

        if (options.target && script.config) {
          script.config.target = options.target;
        }

        if (!script.config.target && !options.environment) {
          const msg4 = 'No target specified and no environment chosen';
          return callback(new Error(msg4), null);
        }

        let validation = core.validate(script);
        if (!validation.valid) {
          log(validation.errors);
          return callback(new Error('Test script validation error'), null);
        }

        return callback(null, {script: script});
      });
    },
    function readPayload(context, callback) {

      if (context.script.config.payload && _.isArray(context.script.config.payload)) {
        async.map(context.script.config.payload,
          function(item, callback2) {
            let absoluteScriptPath = path.resolve(process.cwd(), scriptPath);
            let payloadFile = path.resolve(path.dirname(absoluteScriptPath), item.path);

            let data = fs.readFileSync(payloadFile, 'utf-8');
            csv(data, function(err, parsedData) {
              item.data = parsedData;
              return callback2(err, item);
            });
          },
          function(err, results) {
            if (err) {
              return callback(err, null);
            }
            context.payload = results;
            return callback(null, context);
          });
      } else if (context.script.config.payload &&
                 (_.isObject(context.script.config.payload) ||
                 options.payload)) {

        //use config if path set else use command line
        let csvdata;
        if (context.script.config.payload.path) {
          let absoluteScriptPath = path.resolve(process.cwd(), scriptPath);
          let payloadFile = path.resolve(path.dirname(absoluteScriptPath), context.script.config.payload.path);
          csvdata = fs.readFileSync(payloadFile, 'utf-8');
        } else {
          csvdata = fs.readFileSync(options.payload, 'utf-8');
        }
        csv(csvdata, function(err, payload) {

          if (err) {
            const msg3 = util.format(
              'File %s does not appear to be valid CSV', options.payload);
            return callback(new Error(msg3), null);
          }

          context.payload = payload;

          return callback(null, context);
        });
      } else {
        if (context.script.config.payload) {
          log(
            'WARNING: payload file not set, but payload is configured in %s\n',
            scriptPath);
        }

        return callback(null, context);
      }
    },
    function checkIfXPathIsUsed(context, callback) {
      // FIXME: This should probably be in core.
      let xmlInstalled = null;
      try {
        xmlInstalled = require('artillery-xml-capture');
      } catch (e) {
      }

      let usesXPathCapture = false;
      context.script.scenarios.forEach(function(scenario) {
        scenario.flow.forEach(function(step) {
          let params = step[_.keys(step)[0]];
          if ((params.capture && params.capture.xpath) ||
              (params.match && params.match.xpath)) {
            usesXPathCapture = true;
          }
        });
      });
      if (usesXPathCapture && !xmlInstalled) {
        console.log(chalk.bold.red('Warning: '), chalk.bold.yellow('your test script is using XPath capture, but artillery-xml-capture does not seem to be installed.'));
        console.log(chalk.bold.yellow('Install it with: npm install -g artillery-xml-capture'));
      }
      return callback(null, context);
    }
    ],
    function(err, result) {

      if (err) {
        log(err.message);
        process.exit(1);
      }

      if (result.script.config.processor) {
        let absoluteScriptPath = path.resolve(process.cwd(), scriptPath);
        let processorPath = path.resolve(path.dirname(absoluteScriptPath), result.script.config.processor);
        let processor = require(processorPath);
        result.script.config.processor = processor;
      }

      if (options.insecure) {
        if (result.script.config.tls) {
          if (result.script.config.tls.rejectUnauthorized) {
            log('WARNING: TLS certificate validation enabled in the ' +
                        'test script, but explicitly disabled with ' +
                        '-k/--insecure.');
          }
          result.script.config.tls.rejectUnauthorized = false;
        } else {
          result.script.config.tls = {rejectUnauthorized: false};
        }
      }

      let intermediates = [];
      result.script.config.statsInterval = result.script.config.statsInterval || 10;
      var ee = runner(result.script, result.payload, {
        environment: options.environment
      });

      log('Log file: %s', logfile);

      //var bar;
      //var barTimer;
      ee.on('phaseStarted', function(opts) {
        log(
          'Phase %s%s started - duration: %ss',
          opts.index,
          (opts.name ? ' (' + opts.name + ')' : ''),
          opts.duration);
        if (!options.quiet && process.stdout.isTTY) {
          cli.spinner('');
        }
        // bar = new ProgressBar('[ :bar ]', {
        //   total: opts.duration,
        //   width: 79
        // });
        // bar.tick();
        // barTimer = setInterval(function() {
        //   bar.tick();
        // }, 1 * 1000);
      });

      ee.on('phaseCompleted', function(opts) {

        //clearInterval(barTimer);
        if (!options.quiet && process.stdout.isTTY) {
          cli.spinner('', true);
        }
        log(
          'phase %s%s completed',
          opts.index,
          (opts.name ? ' (' + opts.name + ')' : ''));
      });

      ee.on('stats', function(stats) {
        let report = stats.report();
        intermediates.push(report);
        if (!options.quiet && process.stdout.isTTY) {
          cli.spinner('', true);
        }

        log('Report for the previous %ss @ %s', result.script.config.statsInterval, report.timestamp);
        if (!options.quiet) {
          humanize(report);
        }

        if (!options.quiet && process.stdout.isTTY) {
          cli.spinner('');
        }
      });

      ee.once('done', function(report) {
        if (!options.quiet && process.stdout.isTTY) {
          cli.spinner('', true);
        }

        if (process.stdout.isTTY) {
          cli.spinner('', true);
        }

        log('all scenarios completed');
        log('Complete report @ %s', report.timestamp);
        if (!options.quiet) {
          humanize(report);
        }

        report.phases = _.get(result, 'script.config.phases', []);

        fs.writeFileSync(logfile, JSON.stringify({intermediate: intermediates, aggregate: report}, null, 2), {flag: 'w'});

        if (result.script.config.ensure) {
          const latency = report.latency;
          _.each(result.script.config.ensure, function(max, k) {

            let bucket = k === 'p50' ? 'median' : k;
            if (latency[bucket]) {
              if (latency[bucket] > max) {
                const msg = util.format(
                  'ensure condition failed: ensure.%s < %s', bucket, max);
                log(msg);
                process.exit(1);
              }
            }
          });
        }
      });

      ee.run();
    });
}

function humanize(report) {
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
}
