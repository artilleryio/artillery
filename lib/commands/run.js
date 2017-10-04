/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const path = require('path');
const fs = require('fs');
const util = require('util');

const _ = require('lodash');
const async = require('async');
const csv = require('csv-parse');
const YAML = require('yaml-js');
const moment = require('moment');
const chalk = require('chalk');

const debug = require('debug')('commands:run');
const defaultOptions = require('rc')('artillery');
const validate = require('../dispatcher').validate;
const createRunner = require('../runner');
const createConsoleReporter = require('../console-reporter');

module.exports = run;

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
      createConsoleReporter(runner.events, { quiet: options.quiet || false });

      if (process.env.CUSTOM_REPORTERS) {
        const customReporterNames = process.env.CUSTOM_REPORTERS.split(',');
        customReporterNames.forEach(function(name) {
          const createReporter = require(name);
          createReporter(runner.events, options);
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

        if (script.config.ensure) {
          const latency = report.latency;
          _.each(script.config.ensure, function(max, k) {
            let bucket = k === 'p50' ? 'median' : k;
            if (latency[bucket]) {
              if (latency[bucket] > max) {
                const msg = util.format(
                  'ensure condition failed: ensure.%s < %s',
                  bucket,
                  max
                );
                if (!options.quiet) {
                  console.log(msg);
                }
                process.exit(1);
              }
            }
          });
        }
      });

      runner.run();

      let shuttingDown = false;
      process.once('SIGINT', gracefulShutdown);
      process.once('SIGTERM', gracefulShutdown);

      function gracefulShutdown() {
        if (shuttingDown) {
          return;
        }

        shuttingDown = true;
        debug('Graceful shutdown initiated');
        runner.shutdown(function() {
          process.exit(0);
        });
      }
    }
  );
}

function readScript(scriptPath, callback) {
  fs.readFile(scriptPath, 'utf-8', function(err, data) {
    if (err) {
      const msg = util.format('File not found: %s', scriptPath);
      return callback(new Error(msg), null);
    }

    return callback(null, data, scriptPath);
  });
}

function parseScript(data, scriptPath, callback) {
  let script;
  let fileFormat;

  try {
    if (/\.ya?ml$/.test(path.extname(scriptPath))) {
      fileFormat = 'YAML';
      script = YAML.load(data);
    } else {
      fileFormat = 'JSON';
      script = JSON.parse(data);
    }
  } catch (e) {
    const msg2 = `File ${scriptPath} does not appear to be valid ${fileFormat}: (${e.message})`;
    return callback(new Error(msg2), null);
  }

  return callback(null, script);
}

function prepareConfig(script, scriptPath, options, callback) {
  if (!options.config) {
    return callback(null, script, scriptPath, options);
  }

  fs.readFile(options.config, 'utf-8', function(err, data) {
    if (err) {
      return callback(err, script, scriptPath, options);
    }

    let config;
    try {
      config = YAML.load(data);
    } catch (e) {
      return callback(e, script, scriptPath, options);
    }

    script = _.merge(script, config);

    return callback(null, script, scriptPath, options);
  });
}

function addOverrides(script, scriptPath, options, callback) {
  if (options.overrides) {
    let o = null;

    try {
      o = JSON.parse(options.overrides);
    } catch (err) {
    }

    if (!o) {
      return callback(new Error(`Error: The values of --overrides does not seem to be valid JSON.`));
    }

    script = _.mergeWith(
      script,
      o,
      function customizer(objValue, srcValue, key, object, source, stack) {
        if (_.isArray(srcValue)) {
          return srcValue;
        } else {
          return undefined;
        }
      });
  }

  return callback(null, script, scriptPath, options);
}

function checkConfig(script, scriptPath, options, callback) {
  if (options.environment) {
    debug('environment specified: %s', options.environment);
    if (script.config.environments[options.environment]) {
      _.merge(script.config, script.config.environments[options.environment]);
      script._environment = options.environment;
    } else {
      console.log(
        `WARNING: environment ${options.environment} is set but is not defined in the script`
      );
    }
  }

  if (options.target && script.config) {
    script.config.target = options.target;
  }

  if (!script.config.target && !options.environment) {
    const msg4 = 'No target specified and no environment chosen';
    return callback(new Error(msg4), null);
  }

  //
  // Override/set config.tls if needed:
  //
  if (options.insecure) {
    if (script.config.tls) {
      if (script.config.tls.rejectUnauthorized) {
        console.log(
          'WARNING: TLS certificate validation enabled in the ' +
            'test script, but explicitly disabled with ' +
            '-k/--insecure.'
        );
      }
      script.config.tls.rejectUnauthorized = false;
    } else {
      script.config.tls = { rejectUnauthorized: false };
    }
  }

  //
  // Turn config.payload into an array:
  //
  if (_.get(script, 'config.payload')) {
    // Is it an object or an array?
    if (_.isArray(script.config.payload)) {
      // an array - nothing to do
    } else if (_.isObject(script.config.payload)) {
      if (options.payload && !_.get(script.config.payload, 'path')) {
        script.config.payload.path = path.resolve(
          process.cwd(),
          options.payload
        );
      } else if (!options.payload && !_.get(script.config.payload, 'path')) {
        console.log(
          'WARNING: config.payload.path not set and payload file not specified with -p'
        );
      } else if (options.payload && _.get(script.config.payload, 'path')) {
        console.log(
          'WARNING - both -p and config.payload.path are set, config.payload.path will be ignored.'
        );
        script.config.payload.path = options.payload;
      } else {
        // no -p but config.payload.path is set - nothing to do
      }

      // Make it an array
      script.config.payload = [script.config.payload];
    } else {
      console.log('Ignoring config.payload, not an object or an array.');
    }
  }

  //
  // Resolve all payload paths to absolute paths now:
  //
  _.forEach(script.config.payload, function(payloadSpec) {
    const absoluteScriptPath = path.resolve(process.cwd(), scriptPath);
    const resolvedPathToPayload = path.resolve(
      path.dirname(absoluteScriptPath),
      payloadSpec.path
    );
    payloadSpec.path = resolvedPathToPayload;
  });

  return callback(null, script);
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
      const csvOpts = payloadSpec.options || {};
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
