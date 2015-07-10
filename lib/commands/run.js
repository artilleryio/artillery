'use strict';

var _ = require('lodash');
var runner = require('minigun-core');
var fs = require('fs');
var async = require('async');
var csv = require('csv-parse');
var tty = require('tty');
var colors = require('colors');
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

  console.log('log file: %s', logfile);

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

      var ee = runner(result.script, result.payload);

      //var bar;
      //var barTimer;
      ee.on('phaseStarted', function(opts) {
        console.log(
          'phase %s%s started - duration: %ss'.green,
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
          'phase %s%s completed'.green,
          opts.index,
          (opts.name ? ' (' + opts.name + ')' : ''));
      });

      ee.on('stats', function(stats) {
        if (tty.isatty(process.stdout)) {
          cli.spinner('', true);
        }
        console.log('test stats for the last 10 seconds'.green);
        console.log(JSON.stringify(stats, null, 2));
        if (tty.isatty(process.stdout)) {
          cli.spinner('');
        }
      });

      ee.once('done', function(stats) {

        cli.spinner('', true);

        console.log();
        console.log('all scenarios completed'.green);
        console.log(JSON.stringify(stats, null, 2));

        fs.writeFileSync(logfile, JSON.stringify(stats, null, 2), {flag: 'w'});

        if (result.script.config.ensure) {
          var latency = stats.aggregate.latency;
          _.each(result.script.config.ensure, function(max, k) {

            var bucket = k === 'p50' ? 'median' : k;
            if (latency[bucket]) {
              if (latency[bucket] > max) {
                var msg = util.format(
                  'ensure condition failed: ensure.%s < %s', bucket, max);
                if (tty.isatty(process.stdout)) {
                  console.log(msg.red);
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
