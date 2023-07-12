const { Command, Flags, Args } = require('@oclif/core');

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
const telemetry = require('../telemetry').init();
const validateScript = require('../util/validate-script');
const { Plugin: CloudPlugin } = require('../platform/cloud/cloud');

const { customAlphabet } = require('nanoid');
const parseTagString = require('../util/parse-tag-string');
class RunCommand extends Command {
  static aliases = ['run'];
  // Enable multiple args:
  static strict = false;

  async run() {
    const { flags, argv, args } = await this.parse(RunCommand);

    if (flags.platform === 'aws:fargate') {
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
  target: Flags.string({
    char: 't',
    description:
      'Set target endpoint. Overrides the target already set in the test script'
  }),
  output: Flags.string({
    char: 'o',
    description: 'Write a JSON report to file'
  }),
  insecure: Flags.boolean({
    char: 'k',
    description: 'Allow insecure TLS connections; do not use in production'
  }),
  quiet: Flags.boolean({
    char: 'q',
    description: 'Quiet mode'
  }),
  overrides: Flags.string({
    description: 'Dynamically override values in the test script; a JSON object'
  }),
  variables: Flags.string({
    char: 'v',
    description:
      'Set variables available to vusers during the test; a JSON object'
  }),
  // TODO: Deprecation notices for commands below:

  // TODO: Replace with --profile
  environment: Flags.string({
    char: 'e',
    description: 'Use one of the environments specified in config.environments'
  }),
  config: Flags.string({
    char: 'c',
    description: 'Read configuration for the test from the specified file'
  }),
  payload: Flags.string({
    char: 'p',
    description: 'Specify a CSV file for dynamic data'
  }),
  // multiple allows multiple arguments for the -i flag, which means that e.g.:
  // artillery -i one.yml -i two.yml main.yml
  // does not work as expected. Instead of being considered an argument, "main.yml"
  // is considered to be input for "-i" and oclif then complains about missing
  // argument
  input: Flags.string({
    char: 'i',
    description: 'Input script file',
    multiple: true,
    hidden: true
  }),
  solo: Flags.boolean({
    char: 's',
    description: 'Create only one virtual user'
  }),
  dotenv: Flags.string({
    description: 'Path to a dotenv file to load environment variables from'
  }),
  platform: Flags.string({
    description: 'Runtime platform',
    default: 'local'
  }),
  'platform-opt': Flags.string({
    description:
      'Set a platform-specific option, e.g. --platform region=eu-west-1 for AWS Lambda',
    multiple: true
  }),
  count: Flags.string({
    // locally defaults to number of CPUs with mode = distribute
    default: '1'
  }),
  tags: Flags.string({
    description:
      'Comma-separated list of tags in key:value format to tag the test run, for example: --tags team:sqa,service:foo'
  }),
  note: Flags.string({
    description: 'Add a note/annotation to the test run'
  }),
  record: Flags.boolean({
    description: 'Record test run to Artillery Cloud'
  }),
  key: Flags.string({
    description: 'API key for Artillery Cloud'
  })
};

RunCommand.args = {
  script: Args.string({
    name: 'script',
    required: true
  })
};

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
    checkDirExists(flags.output);
  }

  try {
    const script = await prepareTestExecutionPlan(inputFiles, flags, args);

    const runnerOpts = {
      environment: flags.environment,
      // This is used in the worker to resolve
      // the path to the processor module
      scriptPath: args.script,
      // TODO: This should be an array of files, like inputFiles above
      absoluteScriptPath: path.resolve(process.cwd(), args.script),
      plugins: []
    };

    // Set "name" tag if not set explicitly
    if (tagResult.tags.filter((t) => t.name === 'name').length === 0) {
      tagResult.tags.push({
        name: 'name',
        value: path.basename(runnerOpts.scriptPath)
      });
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

    const idf = customAlphabet('3456789abcdefghjkmnpqrtwxyz');
    const testRunId = `t${idf(4)}_${idf(29)}_${idf(4)}`;

    console.log('Test run id:', testRunId);

    const launcherOpts = {
      platform: flags.platform,
      platformConfig,
      mode: flags.platform === 'local' ? 'distribute' : 'multiply',
      count: parseInt(flags.count || 1, 10),
      cliArgs: flags,
      testRunId
    };

    let launcher = await createLauncher(
      script,
      script.config.payload,
      runnerOpts,
      launcherOpts
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

      for (const e of global.artillery.extensionEvents) {
        const ps = [];
        const testInfo = { endTime: Date.now() };
        if (e.ext === 'beforeExit') {
          ps.push(
            e.method({
              report,
              flags,
              runnerOpts,
              testInfo
            })
          );
        }
        await Promise.allSettled(ps);
      }

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

    new CloudPlugin(null, null, { flags });

    global.artillery.globalEvents.emit('test:init', {
      flags,
      testRunId,
      tags: tagResult.tags,
      metadata: {
        testId: testRunId,
        startedAt: Date.now(),
        count: runnerOpts.count,
        tags: tagResult.tags,
        launchType: flags.platform,
        artilleryVersion: {
          core: global.artillery.version
        }
      }
    });

    launcher.run();

    // TODO: Extract this
    let shuttingDown = false;
    process.once('SIGINT', gracefulShutdown);
    process.once('SIGTERM', gracefulShutdown);

    // TODO: beforeExit event handlers need to fire here
    async function gracefulShutdown(opts = { exitCode: 0 }) {
      debug('shutting down 🦑');
      if (shuttingDown) {
        return;
      }

      debug('Graceful shutdown initiated');

      shuttingDown = true;
      global.artillery.globalEvents.emit('shutdown:start', opts);

      for (const e of global.artillery.extensionEvents) {
        const ps = [];
        if (e.ext === 'onShutdown') {
          ps.push(e.method(opts));
        }
        await Promise.allSettled(ps);
      }

      await telemetry.shutdown();

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
        process.exit(artillery.suggestedExitCode || opts.exitCode);
      })();
    }
  } catch (err) {
    throw err;
  }
};

async function prepareTestExecutionPlan(inputFiles, flags, args) {
  let script1 = {};

  for (const fn of inputFiles) {
    const data = await readScript(fn);
    const parsedData = await parseScript(data);
    script1 = _.merge(script1, parsedData);
  }

  script1 = await checkConfig(script1, inputFiles[0], flags);

  if (flags.config) {
    const absoluteConfigPath = path.resolve(process.cwd(), flags.config);

    if (script1.config?.processor) {
      const newPath = path.resolve(
        path.dirname(absoluteConfigPath),
        script1.config.processor
      );

      const stats = fs.statSync(newPath, { throwIfNoEntry: false });

      if (typeof stats === 'undefined') {
        // No file at that path - backwards compatibility mode:
        console.log(
          'WARNING - config.processor is now resolved relative to the config file'
        );
        console.log('Expected to find file at:', newPath);
      } else {
        script1.config.processor = newPath;
      }
    }
  }

  const script2 = await addOverrides(script1, flags);
  const script3 = await addVariables(script2, flags);
  const script4 = await resolveConfigTemplates(script3, flags);

  if (!script4.config.target) {
    throw new Error('No target specified and no environment chosen');
  }

  const validationError = validateScript(script4);

  if (validationError) {
    console.log(`Scenario validation error: ${validationError}`);

    process.exit(1);
  }

  const script5 = await readPayload(script4);

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

async function sendTelemetry(script, flags, extraProps) {
  function hash(str) {
    return crypto.createHash('sha1').update(str).digest('base64');
  }

  const properties = {};

  if (script.config && script.config.__createdByQuickCommand) {
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

    properties.platform = flags.platform;
    properties.count = flags.count;

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
        'expect',
        'publish-metrics',
        'metrics-by-endpoint',
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

  if (!exists) {
    throw new Error(`Path does not exist: ${output}`);
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

module.exports = RunCommand;
