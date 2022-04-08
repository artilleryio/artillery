const { Command, flags } = require('@oclif/command');

const {
  readScript,
  parseScript,
  addOverrides,
  addVariables,
  resolveConfigTemplates,
  checkConfig
} = require('../../util');

const p = require('util').promisify;
const csv = require('csv-parse');
const debug = require('debug')('commands:run');
const ip = require('ip');

const _ = require('lodash');

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const createLauncher = require('../launch-local');
const createConsoleReporter = require('../../console-reporter');

const moment = require('moment');

const { SSMS } = require('../../core/lib/ssms');
const telemetry = require('../telemetry').init();

class RunCommand extends Command {
  static aliases = ['run'];
  // Enable multiple args:
  static strict = false;

  async run() {
    const { flags, argv, args } = this.parse(RunCommand);

    // Collect all input files for reading/parsing - via args, --config, or -i
    const inputFiles = argv.concat(flags.input || [], flags.config || []);

    try {
      const script = await prepareTestExecutionPlan(inputFiles, flags);

      const runnerOpts = {
        environment: flags.environment,
        // This is used in the worker to resolve
        // the path to the processor module
        scriptPath: args.script,
        absoluteScriptPath: path.resolve(process.cwd(), args.script),
        plugins: []
      };

      if (process.env.WORKERS) {
        runnerOpts.count = parseInt(process.env.WORKERS, 10) || 1;
      }
      if (flags.solo) {
        runnerOpts.count = 1;
      }

      let launcher = await createLauncher(
        script,
        script.config.payload,
        runnerOpts
      );
      let intermediates = [];

      // TODO: Wire up workerLog or something like that
      const consoleReporter = createConsoleReporter(launcher.events, {
        quiet: flags.quiet || false
      });

      let reporters = [consoleReporter];
      if (process.env.CUSTOM_REPORTERS) {
        const customReporterNames = process.env.CUSTOM_REPORTERS.split(',');
        customReporterNames.forEach(function (name) {
          const createReporter = require(name);
          const reporter = createReporter(launcher.events, flags);
          reporters.push(reporter);
        });
      }

      launcher.events.on('phaseStarted', function (phase) {});

      launcher.events.on('stats', function (stats) {
        if (artillery.runtimeOptions.legacyReporting) {
          let report = SSMS.legacyReport(stats).report();
          intermediates.push(report);
        } else {
          intermediates.push(stats);
        }
      });

      launcher.events.on('done', async function (stats) {
        let report;
        if (artillery.runtimeOptions.legacyReporting) {
          report = SSMS.legacyReport(stats).report();
          report.phases = _.get(script, 'config.phases', []);
        } else {
          report = stats;
        }

        if (flags.output) {
          let logfile = getLogFilename(flags.output);
          if (!flags.quiet) {
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

        for (const e of global.artillery.extensionEvents) {
          if (e.ext === 'beforeExit') {
            await e.method({ report: report });
          }
        }

        await gracefulShutdown();
      });

      await sendTelemetry(script, flags);
      launcher.run();

      // TODO: Extract this
      let shuttingDown = false;
      process.once('SIGINT', gracefulShutdown);
      process.once('SIGTERM', gracefulShutdown);

      async function gracefulShutdown() {
        debug('shutting down 🦑');
        if (shuttingDown) {
          return;
        }

        debug('Graceful shutdown initiated');

        shuttingDown = true;
        telemetry.shutdown();

        await launcher.shutdown();
        await (async function () {
          for (const r of reporters) {
            if (r.cleanup) {
              try {
                await p(r.cleanup.bind(r))();
              } catch (cleanupErr) {
                debug(cleanupErr);
              }
            }
          }
          debug('Cleanup finished');
          process.exit(artillery.suggestedExitCode);
        })();
      }
    } catch (err) {
      throw err;
    }
  }

  // async catch(err) {
  //   throw err;
  // }
}

// Line no. 2 onwards is the description in help output
RunCommand.description = `run a test script locally
Run a test script

Examples:

  To run a test script in my-test.yml to completion from the local machine:

    $ artillery run my-test.yml

  To run a test script but override target dynamically:

    $ artillery run -t https://app2.acmecorp.internal my-test.yml
`;

// TODO: Link to an Examples section in the docs

RunCommand.flags = {
  target: flags.string({
    char: 't',
    description:
      'Set target endpoint. Overrides the target already set in the test script'
  }),
  output: flags.string({
    char: 'o',
    description: 'Write a JSON report to file'
  }),
  insecure: flags.boolean({
    char: 'k',
    description: 'Allow insecure TLS connections; do not use in production'
  }),
  quiet: flags.boolean({
    char: 'q',
    description: 'Quiet mode'
  }),
  overrides: flags.string({
    description: 'Dynamically override values in the test script; a JSON object'
  }),
  variables: flags.string({
    char: 'v',
    description:
      'Set variables available to vusers during the test; a JSON object'
  }),
  // TODO: Deprecation notices for commands below:

  // TODO: Replace with --profile
  environment: flags.string({
    char: 'e',
    description: 'Use one of the environments specified in config.environments'
  }),
  config: flags.string({
    char: 'c',
    description: 'Read configuration for the test from the specified file'
  }),
  payload: flags.string({
    char: 'p',
    description: 'Specify a CSV file for dynamic data'
  }),
  // multiple allows multiple arguments for the -i flag, which means that e.g.:
  // artillery -i one.yml -i two.yml main.yml
  // does not work as expected. Instead of being considered an argument, "main.yml"
  // is considered to be input for "-i" and oclif then complains about missing
  // argument
  input: flags.string({
    char: 'i',
    description: 'Input script file',
    multiple: true,
    hidden: true
  }),
  solo: flags.boolean({
    char: 's',
    description: 'Create only one virtual user'
  })
};

RunCommand.args = [{ name: 'script', required: true }];

async function prepareTestExecutionPlan(inputFiles, flags) {
  let script1 = {};
  for (const fn of inputFiles) {
    const data = await readScript(fn);
    const parsedData = await parseScript(data);
    script1 = await checkConfig(_.merge(script1, parsedData), fn, flags);
  }

  const script2 = await addOverrides(script1, flags);
  const script3 = await addVariables(script2, flags);
  const script4 = await resolveConfigTemplates(script3, flags);
  const script5 = await readPayload(script4);

  if (!script5.config.target) {
    throw new Error('No target specified and no environment chosen');
  }

  if (typeof script5.config.phases === 'undefined' || flags.solo) {
    script5.config.phases = [
      {
        duration: 1,
        arrivalCount: 1
      }
    ];
  }

  script5.config.statsInterval = script5.config.statsInterval || 30;
  return script5;
}

async function readPayload(script) {
  if (!script.config.payload) {
    return script;
  }

  for (const payloadSpec of script.config.payload) {
    const data = fs.readFileSync(payloadSpec.path, 'utf-8');

    const csvOpts = Object.assign(
      {
        skip_empty_lines:
          typeof payloadSpec.skipEmptyLines === 'undefined'
            ? true
            : payloadSpec.skipEmptyLines,
        cast: typeof payloadSpec.cast === 'undefined' ? true : payloadSpec.cast,
        from_line: payloadSpec.skipHeader === true ? 2 : 1,
        delimiter: payloadSpec.delimiter || ','
      },
      payloadSpec.options
    );

    try {
      const parsedData = await p(csv)(data, csvOpts);
      payloadSpec.data = parsedData;
    } catch (err) {
      throw err;
    }
  }

  return script;
}

async function sendTelemetry(script, flags) {
  function hash(str) {
    return crypto.createHash('sha1').update(str).digest('base64');
  }

  const properties = {};

  if(script.config && script.config.__createdByQuickCommand) {
    properties['quick'] = true;
  }
  properties['solo'] = flags.solo;
  try {
    // One-way hash of target endpoint:
    if (script.config && script.config.target) {
      const targetHash = hash(script.config.target);
      properties.targetHash = targetHash;
    }

    if (flags.target) {
      const targetHash = hash(flags.target);
      properties.targetHash = targetHash;
    }

    if (properties.targetHash) {
      properties.distinctId = properties.targetHash;
    }

    const ipaddr = ip.address();
    let macaddr;
    for (const [iface, descrs] of Object.entries(os.networkInterfaces())) {
      for (const o of descrs) {
        if (o.address === ipaddr) {
          macaddr = o.mac;
          break;
        }
      }
    }

    if (macaddr) {
      properties.macHash = hash(macaddr);
    }
    properties.ipHash = hash(ipaddr);
    properties.hostnameHash = hash(os.hostname());
    properties.usernameHash = hash(os.userInfo().username);

    if (script.config?.engines) {
      properties.loadsEngines = true;
    }

    properties.enginesUsed = [];
    const OSS_ENGINES = [
      'http',
      'socketio',
      'ws',

      'playwright',
      'kinesis',
      'socketio-v3',
      'rediscluster',
      'kafka',
      'tcp',
      'grpc',
      'meteor',
      'graphql-ws',
      'ldap',
      'lambda',
    ];

    for(const scenario of (script.scenarios || [])) {
      if(OSS_ENGINES.indexOf(scenario.engine || 'http') > -1) {
        properties.enginesUsed.push(scenario.engine || 'http');
      }
    }

    // Official plugins:
    if (script.config.plugins) {
      properties.plugins = true;
      properties.officialPlugins = [];
      const OFFICIAL_PLUGINS = [
        'expect',
        'publish-metrics',
        'metrics-by-endpoint',
        'ensure',
        'hls',
        'fuzzer',
        'ensure'
      ];
      for (const p of OFFICIAL_PLUGINS) {
        if (script.config.plugins[p]) {
          properties.officialPlugins.push(p);
        }
      }
    }

    // before/after hooks
    if (script.before) {
      properties.beforeHook = true;
    }

    if (script.after) {
      properties.afterHook = true;
    }
  } catch (err) {
    debug(err);
  } finally {
    telemetry.capture('test run', properties);
  }
}

function getLogFilename(output, nameFormat) {
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
    logfile = path.join(output, moment().format(nameFormat || defaultFormat));
  }

  return logfile;
}

module.exports = RunCommand;
