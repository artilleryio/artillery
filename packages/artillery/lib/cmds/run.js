const { Command, Flags, Args } = require('@oclif/core');
const { CommonRunFlags } = require('../cli/common-flags');

const p = require('util').promisify;
const csv = require('csv-parse');
const debug = require('debug')('commands:run');
const dotenv = require('dotenv');
const _ = require('lodash');

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const createLauncher = require('../launch-platform');
const createConsoleReporter = require('../../console-reporter');

const moment = require('moment');

const { SSMS } = require('@artilleryio/int-core').ssms;
const telemetry = require('../telemetry');

const { Plugin: CloudPlugin } = require('../platform/cloud/cloud');

const parseTagString = require('../util/parse-tag-string');

const generateId = require('../util/generate-id');
const prepareTestExecutionPlan = require('../util/prepare-test-execution-plan');

class RunCommand extends Command {
  static aliases = ['run'];
  // Enable multiple args:
  static strict = false;

  async run() {
    const { flags, argv, args } = await this.parse(RunCommand);

    if (flags.platform === 'aws:ecs') {
      // Delegate to existing implementation
      const RunFargateCommand = require('./run-fargate');
      return await RunFargateCommand.run(argv);
    }

    await RunCommand.runCommandImplementation(flags, argv, args);
  }

  // async catch(err) {
  //   throw err;
  // }
}

// Line no. 2 onwards is the description in help output
RunCommand.description = `run a test script locally or on AWS Lambda
Run a test script

Examples:

  To run a test script in my-test.yml to completion from the local machine:

    $ artillery run my-test.yml

  To run a test script but override target dynamically:

    $ artillery run -t https://app2.acmecorp.internal my-test.yml
`;

// TODO: Link to an Examples section in the docs

RunCommand.flags = {
  ...CommonRunFlags,
  // TODO: Deprecation notices for commands below:
  payload: Flags.string({
    char: 'p',
    description: 'Specify a CSV file for dynamic data'
  }),
  solo: Flags.boolean({
    char: 's',
    description: 'Create only one virtual user'
  }),
  platform: Flags.string({
    description: 'Runtime platform',
    default: 'local',
    options: ['local', 'aws:lambda', 'az:aci']
  }),
  'platform-opt': Flags.string({
    description:
      'Set a platform-specific option, e.g. --platform-opt region=eu-west-1 for AWS Lambda',
    multiple: true
  }),
  count: Flags.string({
    // locally defaults to number of CPUs with mode = distribute
    default: '1'
  })
};

RunCommand.args = {
  script: Args.string({
    name: 'script',
    required: true
  })
};

let cloud;
RunCommand.runCommandImplementation = async function (flags, argv, args) {
  // Collect all input files for reading/parsing - via args, --config, or -i
  const inputFiles = argv.concat(flags.input || [], flags.config || []);

  const tagResult = parseTagString(flags.tags);
  if (tagResult.errors.length > 0) {
    console.log(
      'WARNING: could not parse some tags:',
      tagResult.errors.join(', ')
    );
  }

  if (tagResult.tags.length > 10) {
    console.log('A maximum of 10 tags is supported');
    process.exit(1);
  }

  // TODO: Move into PlatformLocal
  if (flags.dotenv) {
    const dotEnvPath = path.resolve(process.cwd(), flags.dotenv);
    try {
      fs.statSync(dotEnvPath);
    } catch (err) {
      console.log(`WARNING: could not read dotenv file: ${flags.dotenv}`);
    }
    dotenv.config({ path: dotEnvPath });
  }

  if (flags.output) {
    if (!checkDirExists(flags.output)) {
      console.error('Path does not exist:', flags.output);
      process.exit(1);
    }
  }

  const testRunId = process.env.ARTILLERY_TEST_RUN_ID || generateId('t');
  console.log('Test run id:', testRunId);
  global.artillery.testRunId = testRunId;

  try {
    cloud = new CloudPlugin(null, null, { flags });
    global.artillery.cloudEnabled = cloud.enabled;

    if (cloud.enabled) {
      try {
        await cloud.init();
      } catch (err) {
        if (err.name === 'CloudAPIKeyMissing') {
          console.error(
            'Error: API key is required to record test results to Artillery Cloud'
          );
          console.error(
            'See https://docs.art/get-started-cloud for more information'
          );

          await gracefulShutdown({ exitCode: 7 });
        } else if (err.name === 'APIKeyUnauthorized') {
          console.error(
            'Error: API key is not recognized or is not authorized to record tests'
          );

          await gracefulShutdown({ exitCode: 7 });
        } else if (err.name === 'PingFailed') {
          console.error(
            'Error: unable to reach Artillery Cloud API. This could be due to firewall restrictions on your network'
          );
          console.log('https://docs.art/cloud/err-ping');
          await gracefulShutdown({ exitCode: 7 });
        } else {
          console.error(
            'Error: something went wrong connecting to Artillery Cloud'
          );
          console.error('Check https://status.artillery.io for status updates');
          console.error(err);
        }
      }
    }

    let script;
    try {
      script = await prepareTestExecutionPlan(inputFiles, flags, args);
    } catch (err) {
      console.error('Error:', err.message);
      await gracefulShutdown({ exitCode: 1 });
    }

    var runnerOpts = {
      environment: flags.environment,
      // This is used in the worker to resolve
      // the path to the processor module
      scriptPath: args.script,
      // TODO: This should be an array of files, like inputFiles above
      absoluteScriptPath: path.resolve(process.cwd(), args.script),
      plugins: [],
      scenarioName: flags['scenario-name']
    };

    // Set "name" tag if not set explicitly
    if (tagResult.tags.filter((t) => t.name === 'name').length === 0) {
      tagResult.tags.push({
        name: 'name',
        value: path.basename(runnerOpts.scriptPath)
      });
    }
    // Override the "name" tag with the value of --name if set
    if (flags.name) {
      for (const t of tagResult.tags) {
        if (t.name === 'name') {
          t.value = flags.name;
        }
      }
    }

    if (flags.config) {
      runnerOpts.absoluteConfigPath = path.resolve(process.cwd(), flags.config);
    }

    if (process.env.WORKERS) {
      runnerOpts.count = parseInt(process.env.WORKERS, 10) || 1;
    }
    if (flags.solo) {
      runnerOpts.count = 1;
    }

    let platformConfig = {};
    if (flags['platform-opt']) {
      for (const opt of flags['platform-opt']) {
        const [k, v] = opt.split('=');
        platformConfig[k] = v;
      }
    }

    const launcherOpts = {
      platform: flags.platform,
      platformConfig,
      mode: flags.platform === 'local' ? 'distribute' : 'multiply',
      count: parseInt(flags.count || 1, 10),
      cliArgs: flags,
      testRunId
    };

    var launcher = await createLauncher(
      script,
      script.config.payload,
      runnerOpts,
      launcherOpts
    );

    if (!launcher) {
      console.log('Failed to create launcher');
      await gracefulShutdown({ exitCode: 1 });
    }

    let intermediates = [];

    const metricsToSuppress = getPluginMetricsToSuppress(script);
    // TODO: Wire up workerLog or something like that
    const consoleReporter = createConsoleReporter(launcher.events, {
      quiet: flags.quiet || false,
      metricsToSuppress
    });

    var reporters = [consoleReporter];
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

        for (const ix of intermediates) {
          delete ix.histograms;
          ix.histograms = ix.summaries;
        }
        delete report.histograms;
        report.histograms = report.summaries;

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

      // This is used in the beforeExit event handler in gracefulShutdown
      finalReport = report;
      await gracefulShutdown();
    });

    global.artillery.ext({
      ext: 'beforeExit',
      method: async (event) => {
        try {
          const duration = Math.round(
            (event.report?.lastMetricAt - event.report?.firstMetricAt) / 1000
          );
          await sendTelemetry(script, flags, { duration });
        } catch (_err) {}
      }
    });

    global.artillery.globalEvents.emit('test:init', {
      flags,
      testRunId,
      tags: tagResult.tags,
      metadata: {
        testId: testRunId,
        startedAt: Date.now(),
        count: runnerOpts.count || Number(flags.count),
        tags: tagResult.tags,
        launchType: flags.platform,
        artilleryVersion: {
          core: global.artillery.version
        },
        // Properties from the runnable script object:
        testConfig: {
          target: script.config.target,
          phases: script.config.phases,
          plugins: script.config.plugins,
          environment: script._environment,
          scriptPath: script._scriptPath,
          configPath: script._configPath
        }
      }
    });

    launcher.run();

    var finalReport = {};
    var shuttingDown = false;
    process.on('SIGINT', async () => {
      gracefulShutdown({ earlyStop: true, exitCode: 130 });
    });
    process.on('SIGTERM', async () => {
      gracefulShutdown({ earlyStop: true, exitCode: 143 });
    });

    async function gracefulShutdown(opts = { exitCode: 0 }) {
      debug('shutting down 🦑');
      if (shuttingDown) {
        return;
      }

      debug('Graceful shutdown initiated');

      shuttingDown = true;
      global.artillery.globalEvents.emit('shutdown:start', opts);

      // Run beforeExit first, and then onShutdown

      const ps = [];
      for (const e of global.artillery.extensionEvents) {
        const testInfo = { endTime: Date.now() };
        if (e.ext === 'beforeExit') {
          ps.push(
            e.method({
              ...opts,
              report: finalReport,
              flags,
              runnerOpts,
              testInfo
            })
          );
        }
      }
      await Promise.allSettled(ps);

      const ps2 = [];
      for (const e of global.artillery.extensionEvents) {
        if (e.ext === 'onShutdown') {
          ps2.push(e.method(opts));
        }
      }
      await Promise.allSettled(ps2);

      if (launcher) {
        await launcher.shutdown();
      }

      await (async function () {
        if (reporters) {
          for (const r of reporters) {
            if (r.cleanup) {
              try {
                await p(r.cleanup.bind(r))();
              } catch (cleanupErr) {
                debug(cleanupErr);
              }
            }
          }
        }

        if (
          global.artillery.hasTypescriptProcessor &&
          !process.env.ARTILLERY_TS_KEEP_BUNDLE
        ) {
          try {
            fs.unlinkSync(global.artillery.hasTypescriptProcessor);
          } catch (err) {
            console.log(
              `WARNING: Failed to remove typescript bundled file: ${global.artillery.hasTypescriptProcessor}`
            );
            console.log(err);
          }
          try {
            fs.rmdirSync(path.dirname(global.artillery.hasTypescriptProcessor));
          } catch (err) {}
        }
        debug('Cleanup finished');
        process.exit(artillery.suggestedExitCode || opts.exitCode);
      })();
    }

    global.artillery.shutdown = gracefulShutdown;
  } catch (err) {
    throw err;
  }
};

async function sendTelemetry(script, flags, extraProps) {
  if (process.env.WORKER_ID) {
    debug('Telemetry: Running in cloud worker, skipping test run event');
    return;
  }

  function hash(str) {
    return crypto.createHash('sha1').update(str).digest('base64');
  }

  const properties = {};

  if (script.config && script.config.__createdByQuickCommand) {
    properties['quick'] = true;
  }
  if (cloud && cloud.enabled && cloud.user) {
    properties.cloud = cloud.user;
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

    properties.platform = flags.platform;

    properties.count = flags.count;

    if (properties.targetHash) {
      properties.distinctId = properties.targetHash;
    }

    let macaddr;
    const nonInternalIpv6Interfaces = [];
    for (const [iface, descrs] of Object.entries(os.networkInterfaces())) {
      for (const o of descrs) {
        if (o.internal == true) {
          continue;
        }

        //prefer ipv4 interface when available
        if (o.family != 'IPv4') {
          nonInternalIpv6Interfaces.push(o);
          continue;
        }

        macaddr = o.mac;
        break;
      }
    }

    //default to first ipv6 interface if no ipv4 interface is available
    if (!macaddr && nonInternalIpv6Interfaces.length > 0) {
      macaddr = nonInternalIpv6Interfaces[0].mac;
    }

    if (macaddr) {
      properties.macHash = hash(macaddr);
    }
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
      'lambda'
    ];

    for (const scenario of script.scenarios || []) {
      if (OSS_ENGINES.indexOf(scenario.engine || 'http') > -1) {
        if (properties.enginesUsed.indexOf(scenario.engine || 'http') === -1) {
          properties.enginesUsed.push(scenario.engine || 'http');
        }
      }
    }

    // Official plugins:
    if (script.config.plugins) {
      properties.plugins = true;
      properties.officialPlugins = [];
      const OFFICIAL_PLUGINS = [
        'apdex',
        'expect',
        'publish-metrics',
        'metrics-by-endpoint',
        'hls',
        'fuzzer',
        'ensure',
        'memory-inspector',
        'fake-data',
        'slack'
      ];
      for (const p of OFFICIAL_PLUGINS) {
        if (script.config.plugins[p]) {
          properties.officialPlugins.push(p);
        }
      }
    }

    // publish-metrics reporters
    if (script.config.plugins['publish-metrics']) {
      const OFFICIAL_REPORTERS = [
        'datadog',
        'open-telemetry',
        'newrelic',
        'splunk',
        'dynatrace',
        'cloudwatch',
        'honeycomb',
        'mixpanel',
        'prometheus'
      ];

      properties.officialMonitoringReporters = script.config.plugins[
        'publish-metrics'
      ].map((reporter) => {
        if (OFFICIAL_REPORTERS.includes(reporter.type)) {
          return reporter.type;
        }
      });
    }

    // before/after hooks
    if (script.before) {
      properties.beforeHook = true;
    }

    if (script.after) {
      properties.afterHook = true;
    }

    Object.assign(properties, extraProps);
  } catch (err) {
    debug(err);
  } finally {
    telemetry.capture('test run', properties);
  }
}

function checkDirExists(output) {
  if (!output) {
    return;
  }
  // If destination is a file check only path to its directory
  const exists = path.extname(output)
    ? fs.existsSync(path.dirname(output))
    : fs.existsSync(output);

  return exists;
}

function getLogFilename(output, nameFormat) {
  let logfile;

  // is the destination a directory that exists?
  let isDir = false;
  if (output) {
    try {
      isDir = fs.statSync(output).isDirectory();
    } catch (err) {
      // ENOENT do nothing, handled in checkDirExists before test run
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

function getPluginMetricsToSuppress(script) {
  if (!script.config.plugins) {
    return [];
  }
  const metrics = [];
  for (const [plugin, options] of Object.entries(script.config.plugins)) {
    if (options.suppressOutput) {
      metrics.push(`plugins.${plugin}`);
    }
  }
  return metrics;
}

module.exports = RunCommand;
