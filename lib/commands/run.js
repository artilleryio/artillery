'use strict';

var _ = require('lodash');
var core = require('minigun-core');
var runner = core.runner;
var fs = require('fs');
var async = require('async');
var csv = require('csv-parse');
var tty = require('tty');
var util = require('util');
var cli = require('cli');

module.exports = run;

function run(scriptPath, options) {

  var logfile =
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

  async.waterfall([
    function readScript(callback) {

      fs.readFile(scriptPath, 'utf-8', function(err, data) {

        if (err) {
          var msg = util.format('File not found: %s', scriptPath);
          return callback(new Error(msg), null);
        }

        var script;
        try {
          script = JSON.parse(data);
        } catch (e) {
          var msg2 = util.format(
            'File %s does not appear to be valid JSON', scriptPath);
          return callback(new Error(msg2), null);
        }

        var validation = core.validate(script);
        if (!validation.valid) {
          console.log(validation.errors);
          return callback(new Error('Test script validation error'), null);
        }

        return callback(null, {script: script});
      });
    },
    function readPayload(context, callback) {

      if (options.payload) {
        var csvdata = fs.readFileSync(options.payload, 'utf-8');
        csv(csvdata, function(err, payload) {

          if (err) {
            var msg3 = util.format(
              'File %s does not appear to be valid CSV', options.payload);
            return callback(new Error(msg3), null);
          }

          context.payload = payload;

          return callback(null, context);
        });
      } else {
        if (context.script.config.payload) {
          console.log(
            'WARNING: payload file not set, but payload is configured in %s\n',
            scriptPath);
        }

        return callback(null, context);
      }
    }
    ],
    function(err, result) {

      if (err) {
        console.log(err.message);
        process.exit(1);
      }

      if (options.insecure) {
        if (result.script.config.tls) {
          if (result.script.config.tls.rejectUnauthorized) {
            console.log('WARNING: TLS certificate validation enabled in the ' +
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

      console.log('Log file: %s', logfile);

      //var bar;
      //var barTimer;
      ee.on('phaseStarted', function(opts) {
        console.log(
          'Phase %s%s started - duration: %ss',
          opts.index,
          (opts.name ? ' (' + opts.name + ')' : ''),
          opts.duration);
        if (tty.isatty(process.stdout)) {
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
        if (tty.isatty(process.stdout)) {
          cli.spinner('', true);
        }
        console.log(
          'phase %s%s completed',
          opts.index,
          (opts.name ? ' (' + opts.name + ')' : ''));
      });

      ee.on('stats', function(report) {
        if (tty.isatty(process.stdout)) {
          cli.spinner('', true);
        }

        console.log('Intermediate report @ %s', report.timestamp);
        humanize(report);

        if (tty.isatty(process.stdout)) {
          cli.spinner('');
        }
      });

      ee.once('done', function(report) {

        if (tty.isatty(process.stdout)) {
          cli.spinner('', true);
        }

        console.log('all scenarios completed');
        console.log('Complete report @ %s', report.aggregate.timestamp);
        humanize(report.aggregate);

        fs.writeFileSync(logfile, JSON.stringify(report, null, 2), {flag: 'w'});

        if (result.script.config.ensure) {
          var latency = report.aggregate.latency;
          _.each(result.script.config.ensure, function(max, k) {

            var bucket = k === 'p50' ? 'median' : k;
            if (latency[bucket]) {
              if (latency[bucket] > max) {
                var msg = util.format(
                  'ensure condition failed: ensure.%s < %s', bucket, max);
                if (tty.isatty(process.stdout)) {
                  console.log(msg);
                } else {
                  console.log(msg);
                }
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
