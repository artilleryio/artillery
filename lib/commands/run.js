'use strict';

const _ = require('lodash');
const core = require('minigun-core');
const runner = core.runner;
const fs = require('fs');
const path = require('path');
const async = require('async');
const csv = require('csv-parse');
const util = require('util');
const cli = require('cli');
const YAML = require('yamljs');

module.exports = run;

function run(scriptPath, options) {

  let logfile =
    'minigun_report_' +
    (new Date().toISOString()
      .replace(/-/g, '')
      .replace(/T/, '_')
      .replace(/:/g, '')
      .split('.')[0]) +
    '.json';

  if (options.output) {
    logfile = options.output;
    if (!logfile.match(/\.json$/)) {
      logfile += '.json';
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
        try {
          if (/\.ya?ml$/.test(path.extname(scriptPath))) {
            script = YAML.parse(data);
          } else {
            script = JSON.parse(data);
          }
        } catch (e) {
          const msg2 = util.format(
            'File %s does not appear to be valid JSON', scriptPath);
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
                 _.isObject(context.script.config.payload) &&
                 options.payload) {
        let csvdata = fs.readFileSync(options.payload, 'utf-8');
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
    }
    ],
    function(err, result) {

      if (err) {
        log(err.message);
        process.exit(1);
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

      ee.on('stats', function(report) {
        if (!options.quiet && process.stdout.isTTY) {
          cli.spinner('', true);
        }

        log('Intermediate report @ %s', report.timestamp);
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
        log('Complete report @ %s', report.aggregate.timestamp);
        if (!options.quiet) {
          humanize(report.aggregate);
        }

        fs.writeFileSync(logfile, JSON.stringify(report, null, 2), {flag: 'w'});

        if (result.script.config.ensure) {
          const latency = report.aggregate.latency;
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
  console.log('  Scenarios launched: %s', report.scenariosCreated);
  console.log('  Scenarios completed: %s', report.scenariosCompleted);
  console.log('  Number of requests made: %s', report.requestsCompleted);
  console.log('  RPS: %s', report.rps.mean);
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
