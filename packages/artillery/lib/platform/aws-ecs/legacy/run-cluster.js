/* eslint-disable no-warning-comments */

const AWS = require('aws-sdk');
// Normal debugging for messages, summaries, and errors:
const debug = require('debug')('commands:run-test');
// Verbose debugging for responses from AWS API calls, large objects etc:
const debugVerbose = require('debug')('commands:run-test:v');
const debugErr = require('debug')('commands:run-test:errors');
const A = require('async');
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const defaultOptions = require('rc')('artillery');
const moment = require('moment');

const EnsurePlugin = require('artillery-plugin-ensure');
const SlackPlugin = require('artillery-plugin-slack');

const {
  getADOTRelevantReporterConfigs,
  resolveADOTConfigSettings
} = require('artillery-plugin-publish-metrics');

const EventEmitter = require('events');

const _ = require('lodash');

const pkg = require('../../../../package.json');
const { parseTags } = require('./tags');
const { Timeout, sleep, timeStringToMs } = require('./time');
const { SqsReporter } = require('./sqs-reporter');

const awaitOnEE = require('../../../../lib/util/await-on-ee');

const { VPCSubnetFinder } = require('./find-public-subnets');
const awsUtil = require('./aws-util');
const { createTest } = require('./create-test');

const { TestBundle } = require('./test-object');
const createS3Client = require('./create-s3-client');
const { getBucketName } = require('./util');
const getAccountId = require('../../aws/aws-get-account-id');
const { setCloudwatchRetention } = require('../../aws/aws-cloudwatch');

const dotenv = require('dotenv');

const util = require('./util');

const setDefaultAWSCredentials = require('../../aws/aws-set-default-credentials');

module.exports = runCluster;

let consoleReporter = {
  toggleSpinner: () => {}
};

const {
  TASK_NAME,
  SQS_QUEUES_NAME_PREFIX,
  LOGGROUP_NAME,
  LOGGROUP_RETENTION_DAYS,
  IMAGE_VERSION,
  WAIT_TIMEOUT,
  ARTILLERY_CLUSTER_NAME,
  TEST_RUNS_MAX_TAGS
} = require('./constants');

const {
  TestNotFoundError,
  NoAvailableQueueError,
  ClientServerVersionMismatchError
} = require('./errors');

let IS_FARGATE = false;

const TEST_RUN_STATUS = require('./test-run-status');
const prepareTestExecutionPlan = require('../../../util/prepare-test-execution-plan');

function setupConsoleReporter(quiet) {
  const reporterOpts = {
    outputFormat: 'classic',
    printPeriod: false,
    quiet: quiet
  };

  if (
    global.artillery &&
    global.artillery.version &&
    global.artillery.version.startsWith('2')
  ) {
    delete reporterOpts.outputFormat;
    delete reporterOpts.printPeriod;
  }

  const reporterEvents = new EventEmitter();
  consoleReporter = global.artillery.__createReporter(
    reporterEvents,
    reporterOpts
  );

  // // Disable spinner on v1
  if (
    global.artillery &&
    global.artillery.version &&
    !global.artillery.version.startsWith('2')
  ) {
    consoleReporter.spinner.stop();
    consoleReporter.spinner.clear();
    consoleReporter.spinner = {
      start: () => {},
      stop: () => {},
      clear: () => {}
    };
  }

  return {
    reporterEvents
  };
}

function runCluster(scriptPath, options) {
  if (process.env.DEBUG) {
    AWS.config.logger = console;
  }

  const artilleryReporter = setupConsoleReporter(options.quiet);

  // camelCase all flag names, e.g. `launch-config` becomes launchConfig
  const options2 = {};
  for (const [k, v] of Object.entries(options)) {
    options2[_.camelCase(k)] = v;
  }
  tryRunCluster(scriptPath, options2, artilleryReporter);
}

function logProgress(msg, opts = {}) {
  if (typeof opts.showTimestamp === 'undefined') {
    opts.showTimestamp = true;
  }
  if (global.artillery && global.artillery.log) {
    artillery.logger(opts).log(msg);
  } else {
    consoleReporter.toggleSpinner();
    artillery.log(
      `${msg} ${chalk.gray('[' + moment().format('HH:mm:ss') + ']')}`
    );
    consoleReporter.toggleSpinner();
  }
}

async function tryRunCluster(scriptPath, options, artilleryReporter) {
  const MAX_RETAINED_LOG_SIZE_MB = Number(
    process.env.MAX_RETAINED_LOG_SIZE_MB || '50'
  );
  const MAX_RETAINED_LOG_SIZE = MAX_RETAINED_LOG_SIZE_MB * 1024 * 1024;

  let currentSize = 0;
  // Override console.log so as not to interfere with the spinner
  let outputLines = [];
  let truncated = false;

  console.log = (function () {
    let orig = console.log;
    return function () {
      try {
        orig.apply(console, arguments);

        if (currentSize < MAX_RETAINED_LOG_SIZE) {
          outputLines = outputLines.concat(arguments);
          for (const x of arguments) {
            currentSize += String(x).length;
          }
        } else {
          if (!truncated) {
            truncated = true;
            const msg = `[WARNING] Artillery: maximum retained log size exceeded, max size: ${MAX_RETAINED_LOG_SIZE_MB}MB. Further logs won't be retained.\n\n`;
            process.stdout.write(msg);
            outputLines = outputLines.concat([msg]);
          }
        }
      } catch (err) {
        debug(err);
      }
    };
  })();

  console.error = (function () {
    let orig = console.error;
    return function () {
      try {
        orig.apply(console, arguments);

        if (currentSize < MAX_RETAINED_LOG_SIZE) {
          outputLines = outputLines.concat(arguments);
          for (const x of arguments) {
            currentSize += String(x).length;
          }
        } else {
          if (!truncated) {
            truncated = true;
            const msg = `[WARNING] Artillery: maximum retained log size exceeded, max size: ${MAX_RETAINED_LOG_SIZE_MB}MB. Further logs won't be retained.\n\n`;
            process.stdout.write(msg);
            outputLines = outputLines.concat([msg]);
          }
        }
      } catch (err) {
        debug(err);
      }
    };
  })();

  try {
    await setDefaultAWSCredentials(AWS);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }

  let context = {};
  const inputFiles = [].concat(scriptPath, options.config || []);
  const runnableScript = await prepareTestExecutionPlan(inputFiles, options);

  context.runnableScript = runnableScript;

  let absoluteScriptPath;
  if (typeof scriptPath !== 'undefined') {
    absoluteScriptPath = path.resolve(process.cwd(), scriptPath);
    context.namedTest = false;

    try {
      fs.statSync(absoluteScriptPath);
    } catch (statErr) {
      artillery.log('Could not read file:', scriptPath);
      process.exit(1);
    }
  }

  if (options.dotenv) {
    const dotEnvPath = path.resolve(process.cwd(), options.dotenv);
    const contents = fs.readFileSync(dotEnvPath);
    context.dotenv = dotenv.parse(contents);
  }

  if (options.record) {
    const cloudKey = options.key || process.env.ARTILLERY_CLOUD_API_KEY;
    const cloudEndpoint = process.env.ARTILLERY_CLOUD_ENDPOINT;
    // Explicitly make Artillery Cloud API key available to workers (if it's set)
    // Relying on the fact that contents of context.dotenv gets passed onto workers
    // for it
    if (cloudKey) {
      context.dotenv = {
        ...context.dotenv,
        ARTILLERY_CLOUD_API_KEY: cloudKey
      };
    }

    // Explicitly make Artillery Cloud endpoint available to workers (if it's set)
    if (cloudEndpoint) {
      context.dotenv = {
        ...context.dotenv,
        ARTILLERY_CLOUD_ENDPOINT: cloudEndpoint
      };
    }
  }

  if (options.bundle) {
    context.namedTest = true;
  }

  if (options.maxDuration) {
    try {
      const maxDurationMs = timeStringToMs(options.maxDuration);
      context.maxDurationMs = maxDurationMs;
    } catch (err) {
      throw err;
    }
  }

  context.tags = parseTags(options.tags);

  if (context.tags.length > TEST_RUNS_MAX_TAGS) {
    console.error(
      chalk.red(
        `A maximum of ${TEST_RUNS_MAX_TAGS} tags is allowed per test run`
      )
    );

    process.exit(1);
  }

  // Set name tag if not already set:
  if (context.tags.filter((t) => t.name === 'name').length === 0) {
    if (typeof scriptPath !== 'undefined') {
      context.tags.push({
        name: 'name',
        value: path.basename(scriptPath)
      });
    } else {
      context.tags.push({
        name: 'name',
        value: options.bundle
      });
    }
  }

  if (options.name) {
    for (const t of context.tags) {
      if (t.name === 'name') {
        t.value = options.name;
      }
    }
  }

  context.extraSecrets = options.secret || [];

  context.testId = global.artillery.testRunId;

  if (context.namedTest) {
    context.s3Prefix = options.bundle;
    debug(`Trying to run a named test: ${context.s3Prefix}`);
  }

  if (!context.namedTest) {
    const contextPath = options.context
      ? path.resolve(options.context)
      : path.dirname(absoluteScriptPath);

    debugVerbose('script:', absoluteScriptPath);
    debugVerbose('root:', contextPath);

    const containerScriptPath = path.join(
      path.relative(contextPath, path.dirname(absoluteScriptPath)),
      path.basename(absoluteScriptPath)
    );

    if (containerScriptPath.indexOf('..') !== -1) {
      artillery.log(
        chalk.red(
          'Test script must reside inside the context dir. See Artillery docs for more details.'
        )
      );
      process.exit(1);
    }

    // FIXME: These need clearer names. dir vs path and local vs container.
    context.contextDir = contextPath;
    context.newScriptPath = containerScriptPath;

    debug('container script path:', containerScriptPath);
  }

  const count = Number(options.count) || 1;

  if (typeof options.taskRoleName !== 'undefined') {
    let customRoleName = options.taskRoleName;
    // Allow ARNs for convenience
    // https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_identifiers.html
    // We split by :role because role names may contain slash characters (subpaths)
    if (customRoleName.startsWith('arn:aws:iam')) {
      customRoleName = customRoleName.split(':role/')[1];
    }
    context.customTaskRoleName = customRoleName;
  }

  const clusterName = options.cluster || ARTILLERY_CLUSTER_NAME;
  if (options.launchConfig) {
    let launchConfig;
    try {
      launchConfig = JSON.parse(options.launchConfig);
    } catch (parseErr) {
      debug(parseErr);
    }

    if (!launchConfig) {
      artillery.log(
        chalk.red(
          "Launch config could not be parsed. Please check that it's valid JSON."
        )
      );
      process.exit(1);
    }

    if (launchConfig.ulimits && !Array.isArray(launchConfig.ulimits)) {
      // TODO: Proper schema validation for the object
      artillery.log(chalk.red('ulimits must be an array of objects'));
      artillery.log(
        'Please see AWS documentation for more information:\nhttps://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_Ulimit.html'
      );
      process.exit(1);
    }
    options.launchConfig = launchConfig;
  } else {
    options.launchConfig = {};
  }

  if (options.cpu) {
    const n = Number(options.cpu);
    if (isNaN(n)) {
      artillery.log('The value of --cpu must be a number');
      process.exit(1);
    }

    // Allow specifying 16 vCPU as either "16" or "16384". The actual value is
    // validated later.
    const MAX_VCPUS = 16;
    if (n <= MAX_VCPUS) {
      options.launchConfig.cpu = n * 1024;
    } else {
      options.launchConfig.cpu = n;
    }
  }

  if (options.memory) {
    const n = Number(options.memory);
    if (isNaN(n)) {
      artillery.log('The value of --memory must be a number');
      process.exit(1);
    }

    const MAX_MEMORY_IN_GB = 120;
    if (n <= MAX_MEMORY_IN_GB) {
      options.launchConfig.memory = String(parseInt(options.memory, 10) * 1024);
    } else {
      options.launchConfig.memory = options.memory;
    }
  }

  // check launch type is valid:
  if (typeof options.launchType !== 'undefined') {
    if (
      options.launchType !== 'ecs:fargate' &&
      options.launchType !== 'ecs:ec2'
    ) {
      artillery.log(
        'Invalid launch type - the value of --launch-type needs to be ecs:fargate or ecs:ec2'
      );
      process.exit(1);
    }
  }

  if (typeof options.fargate !== 'undefined') {
    console.error(
      'The --fargate flag is deprecated, use --launch-type ecs:fargate instead'
    );
  }

  if (options.fargate && options.launchType) {
    console.error(
      'Either --fargate or --launch-type flag should be set, not both'
    );
    process.exit(1);
  }

  if (
    typeof options.fargate === 'undefined' &&
    typeof options.launchType === 'undefined'
  ) {
    options.launchType = 'ecs:fargate';
  }

  IS_FARGATE =
    typeof options.fargate !== 'undefined' || // --fargate set
    typeof options.publicSubnetIds !== 'undefined' || // --public-subnet-ids set
    (typeof options.launchType !== 'undefined' &&
      options.launchType === 'ecs:fargate') || // --launch-type ecs:fargate
    typeof options.launchType === 'undefined';

  global.artillery.globalEvents.emit('test:init', {
    flags: options,
    testRunId: context.testId,
    tags: context.tags,
    metadata: {
      testId: context.testId,
      startedAt: Date.now(),
      count,
      tags: context.tags,
      launchType: options.launchType
    }
  });

  let packageJsonPath;
  if (options.packages) {
    packageJsonPath = path.resolve(process.cwd(), options.packages);
    try {
      // TODO: Check that filename is package.json

      JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    } catch (err) {
      console.error('Could not load package dependency list');
      console.error('Trying to read from:', packageJsonPath);
      console.error(err);
    }
  }

  context = Object.assign(context, {
    scriptPath: absoluteScriptPath,
    originalScriptPath: scriptPath,
    count: count,
    region: options.region,
    taskName: `${TASK_NAME}_${
      IS_FARGATE ? 'fargate' : ''
    }_${clusterName}_${IMAGE_VERSION.replace(/\./g, '-')}_${Math.floor(
      Math.random() * 1e6
    )}`,
    clusterName: clusterName,
    logGroupName: LOGGROUP_NAME,
    cliOptions: options,
    isFargate: IS_FARGATE,
    isCapacitySpot: typeof options.spot !== 'undefined',
    configTableName: '',
    status: TEST_RUN_STATUS.INITIALIZING,
    packageJsonPath,
    taskArns: []
  });

  let subnetIds = [];
  if (options.publicSubnetIds) {
    console.error(
      `${chalk.yellow(
        'Warning'
      )}: --public-subnet-ids will be deprecated. Use --subnet-ids instead.`
    );

    subnetIds = options.publicSubnetIds.split(',');
  }
  if (options.subnetIds) {
    subnetIds = options.subnetIds.split(',');
  }

  if (IS_FARGATE) {
    context.fargatePublicSubnetIds = subnetIds;
    context.fargateSecurityGroupIds =
      typeof options.securityGroupIds !== 'undefined'
        ? options.securityGroupIds.split(',')
        : [];
  }

  if (global.artillery && global.artillery.telemetry) {
    global.artillery.telemetry.capture('run-test', {
      version: global.artillery.version,
      proVersion: pkg.version,
      count: count,
      launchPlatform: IS_FARGATE ? 'ecs:fargate' : 'ecs:ec2',
      usesTags: context.tags.length > 0,
      region: context.region,
      crossRegion: context.region !== context.backendRegion
    });
  }

  async function newWaterfall(artilleryReporter) {
    let testRunCompletedSuccessfully = true;

    let shuttingDown = false;

    async function gracefulShutdown(opts = { earlyStop: false, exitCode: 0 }) {
      if (shuttingDown) {
        return;
      }

      shuttingDown = true;

      if (opts.earlyStop) {
        if (context.status !== TEST_RUN_STATUS.ERROR) {
          // Retain ERROR status if already set elsewhere
          context.status = TEST_RUN_STATUS.EARLY_STOP;
        }
      }
      await cleanupResources(context);

      global.artillery.globalEvents.emit('shutdown:start', {
        exitCode: opts.exitCode,
        earlyStop: opts.earlyStop
      });

      const ps = [];
      for (const e of global.artillery.extensionEvents) {
        const testInfo = { endTime: Date.now() };
        if (e.ext === 'beforeExit') {
          ps.push(
            e.method({
              report: context.aggregateReport,
              flags: context.cliOptions,
              runnerOpts: {
                environment: context.cliOptions?.environment,
                scriptPath: '',
                absoluteScriptPath: ''
              },
              testInfo
            })
          );
        }
      }
      await Promise.allSettled(ps);

      const ps2 = [];
      const shutdownOpts = {
        earlyStop: opts.earlyStop,
        exitCode: opts.exitCode
      };
      for (const e of global.artillery.extensionEvents) {
        if (e.ext === 'onShutdown') {
          ps2.push(e.method(shutdownOpts));
        }
      }
      await Promise.allSettled(ps2);

      await global.artillery.telemetry?.shutdown();

      process.exit(global.artillery.suggestedExitCode || opts.exitCode);
    }

    global.artillery.shutdown = gracefulShutdown;

    process.on('SIGINT', async () => {
      if (shuttingDown) {
        return;
      }
      console.log('Stopping test run (SIGINT received)...');
      await gracefulShutdown({ exitCode: 1, earlyStop: true });
    });
    process.on('SIGTERM', async () => {
      if (shuttingDown) {
        return;
      }
      console.log('Stopping test run (SIGTERM received)...');
      await gracefulShutdown({ exitCode: 1, earlyStop: true });
    });

    // Messages from SQS reporter created later will be relayed via this EE
    context.reporterEvents = artilleryReporter.reporterEvents;

    try {
      logProgress('Checking AWS connectivity...');

      context.accountId = await getAccountId();
      await Promise.all([
        (async function (context) {
          const bucketName = await getBucketName();
          context.s3Bucket = bucketName;
          return context;
        })(context)
      ]);

      logProgress('Checking cluster...');
      const clusterExists = await checkTargetCluster(context);

      if (!clusterExists) {
        if (typeof context.cliOptions.cluster === 'undefined') {
          // User did not specify a cluster with --cluster, and ARTILLERY_CLUSTER_NAME
          // does not exist, so create it
          await createArtilleryCluster(context);
        } else {
          // User specified a cluster, but it's not there
          throw new Error(
            `Could not find cluster ${context.clusterName} in ${context.region}`
          );
        }
      }

      if (context.tags.length > 0) {
        logProgress(
          'Tags: ' + context.tags.map((t) => t.name + ':' + t.value).join(', ')
        );
      }
      logProgress(`Test run ID: ${context.testId}`);

      logProgress('Preparing launch platform...');

      await maybeGetSubnetIdsForFargate(context);

      logProgress(
        `Environment:
  Account:     ${context.accountId}
  Region:      ${context.region}
  Count:       ${context.count}
  Cluster:     ${context.clusterName}
  Launch type: ${context.cliOptions.launchType} ${
          context.isFargate && context.isCapacitySpot ? '(Spot)' : '(On-demand)'
        }
`,
        { showTimestamp: false }
      );

      await createQueue(context);
      await checkCustomTaskRole(context);
      logProgress('Preparing test bundle...');
      await createTestBundle(context);
      await createADOTDefinitionIfNeeded(context);
      await ensureTaskExists(context);
      await getManifest(context);
      await generateTaskOverrides(context);

      logProgress('Launching workers...');
      await setupDefaultECSParams(context);

      if (
        context.status !== TEST_RUN_STATUS.EARLY_STOP &&
        context.status !== TEST_RUN_STATUS.TERMINATING
      ) {
        //  Set up SQS listener:
        listen(context, artilleryReporter.reporterEvents);
        await launchLeadTask(context);
      }

      setCloudwatchRetention(
        `${LOGGROUP_NAME}/${context.clusterName}`,
        LOGGROUP_RETENTION_DAYS,
        {
          maxRetries: 10,
          waitPerRetry: 2 * 1000
        }
      );

      if (
        context.status !== TEST_RUN_STATUS.EARLY_STOP &&
        context.status !== TEST_RUN_STATUS.TERMINATING
      ) {
        logProgress(
          context.isFargate ? 'Waiting for Fargate...' : 'Waiting for ECS...'
        );
        await ecsRunTask(context);
      }

      if (
        context.status !== TEST_RUN_STATUS.EARLY_STOP &&
        context.status !== TEST_RUN_STATUS.TERMINATING
      ) {
        await waitForTasks2(context);
      }

      if (
        context.status !== TEST_RUN_STATUS.EARLY_STOP &&
        context.status !== TEST_RUN_STATUS.TERMINATING
      ) {
        logProgress('Waiting for workers to come online...');
        await waitForWorkerSync(context);
        await sendGoSignal(context);
        logProgress('Workers are running, waiting for reports...');

        if (context.maxDurationMs && context.maxDurationMs > 0) {
          logProgress(
            `Max duration for test run is set to: ${context.cliOptions.maxDuration}`
          );
          const testDurationTimeout = new Timeout(context.maxDurationMs);
          testDurationTimeout.start();
          testDurationTimeout.on('timeout', async () => {
            artillery.log(
              `Max duration of test run exceeded: ${context.cliOptions.maxDuration}\n`
            );
            await gracefulShutdown({ earlyStop: true });
          });
        }

        context.status = TEST_RUN_STATUS.RECEIVING_REPORTS;
      }

      // Need to wait for all reports to be over here, not exit
      const workerState = await awaitOnEE(
        artilleryReporter.reporterEvents,
        'workersDone'
      );
      debug(workerState);

      logProgress(`Test run completed: ${context.testId}`);

      context.status = TEST_RUN_STATUS.COMPLETED;

      let checks = [];
      global.artillery.globalEvents.once('checks', async (results) => {
        checks = results;
      });

      if (context.ensureSpec) {
        new EnsurePlugin.Plugin({ config: { ensure: context.ensureSpec } });
      }

      if (context.fullyResolvedConfig?.plugins?.slack) {
        new SlackPlugin.Plugin({
          config: context.fullyResolvedConfig
        });
      }

      if (context.cliOptions.output) {
        let logfile = getLogFilename(
          context.cliOptions.output,
          defaultOptions.logFilenameFormat
        );

        for (const ix of context.intermediateReports) {
          delete ix.histograms;
          ix.histograms = ix.summaries;
        }
        delete context.aggregateReport.histograms;
        context.aggregateReport.histograms = context.aggregateReport.summaries;

        const jsonReport = {
          intermediate: context.intermediateReports,
          aggregate: context.aggregateReport,
          testId: context.testId,
          metadata: {
            tags: context.tags,
            count: context.count,
            region: context.region,
            cluster: context.clusterName,
            artilleryVersion: {
              core: global.artillery.version,
              pro: pkg.version
            }
          },
          ensure: checks.map((c) => {
            return {
              condition: c.original,
              success: c.result === 1,
              strict: c.strict
            };
          })
        };

        fs.writeFileSync(logfile, JSON.stringify(jsonReport, null, 2), {
          flag: 'w'
        });
      }
      debug(context.testId, 'done');
    } catch (err) {
      debug(err);
      if (err.code === 'InvalidParameterException') {
        if (
          err.message
            .toLowerCase()
            .indexOf('no container instances were found') !== -1
        ) {
          artillery.log(
            chalk.yellow('The ECS cluster has no active EC2 instances')
          );
        } else {
          artillery.log(err);
        }
      } else if (err instanceof TestNotFoundError) {
        artillery.log(`Test ${context.s3Prefix} not found`);
      } else if (
        err instanceof NoAvailableQueueError ||
        err instanceof ClientServerVersionMismatchError
      ) {
        artillery.log(chalk.red('Error:', err.message));
      } else {
        artillery.log(util.formatError(err));
        artillery.log(err);
        artillery.log(err.stack);
      }
      testRunCompletedSuccessfully = false;
      global.artillery.suggestedExitCode = 1;
    } finally {
      if (!testRunCompletedSuccessfully) {
        logProgress('Cleaning up...');
        context.status = TEST_RUN_STATUS.ERROR;
        await gracefulShutdown({ earlyStop: true, exitCode: 1 });
      } else {
        context.status = TEST_RUN_STATUS.COMPLETED;
        await gracefulShutdown({ earlyStop: false, exitCode: 0 });
      }
    }
  }

  await newWaterfall(artilleryReporter);
}

async function cleanupResources(context) {
  try {
    if (context.sqsReporter) {
      context.sqsReporter.stop();
    }

    if (context.adot?.SSMParameterPath) {
      await awsUtil.deleteParameter(
        context.adot.SSMParameterPath,
        context.region
      );
    }

    if (context.taskArns && context.taskArns.length > 0) {
      for (const taskArn of context.taskArns) {
        try {
          const ecs = new AWS.ECS({
            apiVersion: '2014-11-13',
            region: context.region
          });
          await ecs
            .stopTask({
              task: taskArn,
              cluster: context.clusterName,
              reason: 'Test cleanup'
            })
            .promise();
        } catch (err) {
          // TODO: Retry if appropriate, give the user more information
          // to be able to fall back to manual intervention if possible.
          // TODO: Consumer has no idea if this succeeded or not
          debug(err);
        }
      }
    }

    // TODO: Should either retry, or not throw in any of these
    await Promise.all([
      deleteQueue(context),
      deregisterTaskDefinition(context),
      gcQueues(context)
    ]);
  } catch (err) {
    artillery.log(err);
  }
}

function checkFargateResourceConfig(cpu, memory) {
  function generateListOfOptionsMiB(minGB, maxGB, incrementGB) {
    const result = [];
    for (let i = 0; i <= (maxGB - minGB) / incrementGB; i++) {
      result.push((minGB + incrementGB * i) * 1024);
    }

    return result;
  }

  // Based on https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-cpu-memory-error.html
  const FARGATE_VALID_CONFIGS = {
    256: [512, 1024, 2048],
    512: [1024, 2048, 3072, 4096],
    1024: [2048, 3072, 4096, 5120, 6144, 7168, 8192],
    2048: generateListOfOptionsMiB(4, 16, 1),
    4096: generateListOfOptionsMiB(8, 30, 1),
    8192: generateListOfOptionsMiB(16, 60, 4),
    16384: generateListOfOptionsMiB(32, 120, 8)
  };

  if (!FARGATE_VALID_CONFIGS[cpu]) {
    return new Error(
      `Unsupported cpu override for Fargate. Must be one of: ${Object.keys(
        FARGATE_VALID_CONFIGS
      ).join(', ')}`
    );
  }

  if (FARGATE_VALID_CONFIGS[cpu].indexOf(memory) < 0) {
    return new Error(
      `Fargate memory override for cpu = ${cpu} must be one of: ${FARGATE_VALID_CONFIGS[
        cpu
      ].join(', ')}`
    );
  }

  return null;
}

async function createArtilleryCluster(context) {
  const ecs = new AWS.ECS({ apiVersion: '2014-11-13', region: context.region });
  try {
    await ecs
      .createCluster({
        clusterName: ARTILLERY_CLUSTER_NAME,
        capacityProviders: ['FARGATE_SPOT']
      })
      .promise();

    let retries = 0;
    while (retries < 12) {
      const clusterActive = await checkTargetCluster(context);
      if (clusterActive) {
        break;
      }
      retries++;
      await sleep(10 * 1000);
    }
  } catch (err) {
    throw err;
  }
}

//
// Check that ECS cluster exists:
//
async function checkTargetCluster(context) {
  const ecs = new AWS.ECS({ apiVersion: '2014-11-13', region: context.region });
  try {
    const response = await ecs
      .describeClusters({ clusters: [context.clusterName] })
      .promise();
    debug(response);
    if (response.clusters.length === 0 || response.failures.length > 0) {
      debugVerbose(response);
      return false;
    } else {
      const activeClusters = response.clusters.filter(
        (c) => c.status === 'ACTIVE'
      );
      return activeClusters.length > 0;
    }
  } catch (err) {
    debugVerbose(err);
    return false;
  }
}

async function maybeGetSubnetIdsForFargate(context) {
  if (!context.isFargate) {
    return context;
  }

  // TODO: Sanity check that subnets actually exist before trying to use them in test definitions

  if (context.fargatePublicSubnetIds.length > 0) {
    return context;
  }

  debug('Subnet IDs not provided, looking up default VPC');

  const f = new VPCSubnetFinder({ region: context.region });
  const publicSubnets = await f.findPublicSubnets();

  if (publicSubnets.length === 0) {
    throw new Error('Could not find public subnets in default VPC');
  }

  context.fargatePublicSubnetIds = publicSubnets.map((s) => s.SubnetId);

  debug('Found public subnets:', context.fargatePublicSubnetIds.join(', '));

  return context;
}

async function createTestBundle(context) {
  return new Promise((resolve, reject) => {
    createTest(
      context.scriptPath,
      {
        name: context.testId,
        config: context.cliOptions.config,
        packageJsonPath: context.packageJsonPath,
        flags: context.cliOptions
      },
      function (err, result) {
        if (err) {
          return reject(err);
        } else {
          context.fullyResolvedConfig = result.manifest.fullyResolvedConfig;
          return resolve(context);
        }
      }
    );
  });
}

async function createADOTDefinitionIfNeeded(context) {
  const publishMetricsConfig =
    context.fullyResolvedConfig.plugins?.['publish-metrics'];
  if (!publishMetricsConfig) {
    debug('No publish-metrics plugin set, skipping ADOT configuration');
    return context;
  }

  const adotRelevantConfigs =
    getADOTRelevantReporterConfigs(publishMetricsConfig);
  if (adotRelevantConfigs.length === 0) {
    debug('No ADOT relevant reporter configs set, skipping ADOT configuration');
    return context;
  }

  try {
    const { adotEnvVars, adotConfig } = resolveADOTConfigSettings({
      configList: adotRelevantConfigs,
      dotenv: { ...context.dotenv }
    });

    context.dotenv = Object.assign(context.dotenv || {}, adotEnvVars);

    context.adot = {
      SSMParameterPath: `/artilleryio/OTEL_CONFIG_${context.testId}`
    };

    await awsUtil.putParameter(
      context.adot.SSMParameterPath,
      JSON.stringify(adotConfig),
      'String',
      context.region
    );

    context.adot.taskDefinition = {
      name: 'adot-collector',
      image: 'amazon/aws-otel-collector:v0.39.0',
      command: [
        '--config=/etc/ecs/container-insights/otel-task-metrics-config.yaml'
      ],
      secrets: [
        {
          name: 'AOT_CONFIG_CONTENT',
          valueFrom: `arn:aws:ssm:${context.region}:${context.accountId}:parameter${context.adot.SSMParameterPath}`
        }
      ],
      logConfiguration: {
        logDriver: 'awslogs',
        options: {
          'awslogs-group': `${context.logGroupName}/${context.clusterName}`,
          'awslogs-region': context.region,
          'awslogs-stream-prefix': `artilleryio/${context.testId}`,
          'awslogs-create-group': 'true'
        }
      }
    };
  } catch (err) {
    throw new Error(err);
  }
  return context;
}

async function ensureTaskExists(context) {
  return new Promise((resolve, reject) => {
    const ecs = new AWS.ECS({
      apiVersion: '2014-11-13',
      region: context.region
    });

    // Note: these are integers for container definitions, and strings for task definitions (on Fargate)
    // Defaults have to be Fargate-compatible
    // https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html#task_size
    let cpu = 4096;
    let memory = 8192;

    const defaultUlimits = {
      nofile: {
        softLimit: 8192,
        hardLimit: 8192
      }
    };
    let ulimits = [];

    if (context.cliOptions.launchConfig) {
      const lc = context.cliOptions.launchConfig;
      if (lc.cpu) {
        cpu = parseInt(lc.cpu, 10);
      }
      if (lc.memory) {
        memory = parseInt(lc.memory, 10);
      }

      if (lc.ulimits) {
        lc.ulimits.forEach((u) => {
          if (!defaultUlimits[u.name]) {
            defaultUlimits[u.name] = {};
          }
          defaultUlimits[u.name] = {
            softLimit: u.softLimit,
            hardLimit:
              typeof u.hardLimit == 'number' ? u.hardLimit : u.softLimit
          };
        });
      }

      // TODO: Check this earlier to return an error faster.
      if (context.isFargate) {
        const configErr = checkFargateResourceConfig(cpu, memory);
        if (configErr) {
          return reject(configErr);
        }
      }
    }

    ulimits = Object.keys(defaultUlimits).map((name) => {
      return {
        name: name,
        softLimit: defaultUlimits[name].softLimit,
        hardLimit: defaultUlimits[name].hardLimit
      };
    });

    const defaultArchitecture = 'x86_64';
    const imageUrl =
      process.env.WORKER_IMAGE_URL ||
      `public.ecr.aws/d8a4z9o5/artillery-worker:${IMAGE_VERSION}-${defaultArchitecture}`;

    const secrets = [
      'NPM_TOKEN',
      'NPM_REGISTRY',
      'NPM_SCOPE',
      'NPM_SCOPE_REGISTRY',
      'NPMRC',
      'ARTIFACTORY_AUTH',
      'ARTIFACTORY_EMAIL'
    ]
      .concat(context.extraSecrets)
      .map((secretName) => {
        return {
          name: secretName,
          valueFrom: `arn:aws:ssm:${context.region}:${context.accountId}:parameter/artilleryio/${secretName}`
        };
      });

    const artilleryContainerDefinition = {
      name: 'artillery',
      image: imageUrl,
      cpu: cpu,
      command: [],
      entryPoint: ['/artillery/loadgen-worker'],
      memory: memory,
      secrets: secrets,
      ulimits: ulimits,
      essential: true,
      logConfiguration: {
        logDriver: 'awslogs',
        options: {
          'awslogs-group': `${context.logGroupName}/${context.clusterName}`,
          'awslogs-region': context.region,
          'awslogs-stream-prefix': `artilleryio/${context.testId}`,
          'awslogs-create-group': 'true',
          mode: 'non-blocking'
        }
      }
    };

    if (context.cliOptions.containerDnsServers) {
      artilleryContainerDefinition.dnsServers =
        context.cliOptions.containerDnsServers.split(',');
    }

    let taskDefinition = {
      family: context.taskName,
      containerDefinitions: [artilleryContainerDefinition],
      executionRoleArn: context.taskRoleArn
    };

    if (typeof context.adot !== 'undefined') {
      taskDefinition.containerDefinitions.push(context.adot.taskDefinition);
    }

    context.taskDefinition = taskDefinition;

    if (!context.isFargate && taskDefinition.containerDefinitions.length > 1) {
      // Limits for sidecar have to be set explicitly on ECS EC2
      taskDefinition.containerDefinitions[1].memory = 1024;
      taskDefinition.containerDefinitions[1].cpu = 1024;
    }

    if (context.isFargate) {
      taskDefinition.networkMode = 'awsvpc';
      taskDefinition.requiresCompatibilities = ['FARGATE'];
      taskDefinition.cpu = String(cpu);
      taskDefinition.memory = String(memory);
      // NOTE: This role must exist.
      // This value cannot be an override, meaning it's hardcoded into the task definition.
      // That in turn means that if the role is updated then the task definition needs to be
      // recreated too
      taskDefinition.executionRoleArn = context.taskRoleArn; // TODO: A separate role for Fargate
    }

    const params = {
      taskDefinition: context.taskName
    };

    debug('Task definition\n', JSON.stringify(taskDefinition, null, 4));

    ecs.describeTaskDefinition(params, function (err, _data) {
      if (err) {
        ecs.registerTaskDefinition(taskDefinition, function (err, response) {
          if (err) {
            artillery.log(err);
            artillery.log('Could not create ECS task, please try again');
            return reject(err);
          } else {
            debug('OK: ECS task registered');
            debugVerbose(JSON.stringify(response, null, 4));
            context.taskDefinitionArn =
              response.taskDefinition.taskDefinitionArn;
            debug(`Task definition ARN: ${context.taskDefinitionArn}`);
            return resolve(context);
          }
        });
      } else {
        debug('OK: ECS task exists');
        if (process.env.ECR_IMAGE_VERSION) {
          debug(
            'ECR_IMAGE_VERSION is set, but the task definition was already in place.'
          );
        }
        return resolve(context);
      }
    });
  });
}

async function checkCustomTaskRole(context) {
  if (!context.customTaskRoleName) {
    return;
  }

  const iam = new AWS.IAM();
  try {
    const roleData = await iam
      .getRole({ RoleName: context.customTaskRoleName })
      .promise();
    context.customRoleArn = roleData.Role.Arn;
    context.taskRoleArn = roleData.Role.Arn;
    debug(roleData);
  } catch (err) {
    throw err;
  }
}

async function gcQueues(context) {
  const sqs = new AWS.SQS({
    region: context.region
  });

  let data;
  try {
    data = await sqs
      .listQueues({
        QueueNamePrefix: SQS_QUEUES_NAME_PREFIX,
        MaxResults: 1000
      })
      .promise();
  } catch (err) {
    debug(err);
  }

  if (data && data.QueueUrls && data.QueueUrls.length > 0) {
    for (const qu of data.QueueUrls) {
      try {
        const data = await sqs
          .getQueueAttributes({
            QueueUrl: qu,
            AttributeNames: ['CreatedTimestamp']
          })
          .promise();
        const ts = Number(data.Attributes['CreatedTimestamp']) * 1000;
        // Delete after 96 hours
        if (Date.now() - ts > 96 * 60 * 60 * 1000) {
          await sqs.deleteQueue({ QueueUrl: qu }).promise();
        }
      } catch (err) {
        // TODO: Filter on errors which may be ignored, e.g.:
        // AWS.SimpleQueueService.NonExistentQueue: The specified queue does not exist
        // which can happen if another test ends between calls to listQueues and getQueueAttributes.
        // Sometimes SQS returns recently deleted queues to ListQueues too.
        debug(err);
      }
    }
  }
}

async function deleteQueue(context) {
  if (!context.sqsQueueUrl) {
    return;
  }

  const sqs = new AWS.SQS({
    region: context.region
  });

  try {
    await sqs.deleteQueue({ QueueUrl: context.sqsQueueUrl }).promise();
  } catch (err) {
    console.error(`Unable to clean up SQS queue. URL: ${context.sqsQueueUrl}`);
    debug(err);
  }
}

async function createQueue(context) {
  const sqs = new AWS.SQS({
    region: context.region
  });

  const queueName = `${SQS_QUEUES_NAME_PREFIX}_${context.testId.slice(
    0,
    30
  )}.fifo`;
  const params = {
    QueueName: queueName,
    Attributes: {
      FifoQueue: 'true',
      ContentBasedDeduplication: 'false',
      MessageRetentionPeriod: '1800',
      VisibilityTimeout: '600' // 10 minutes
    }
  };

  try {
    const result = await sqs.createQueue(params).promise();
    context.sqsQueueUrl = result.QueueUrl;
  } catch (err) {
    throw err;
  }

  // Wait for the queue to be available:
  let waited = 0;
  let ok = false;
  while (waited < 120 * 1000) {
    try {
      const results = await sqs
        .listQueues({ QueueNamePrefix: queueName })
        .promise();
      if (results.QueueUrls && results.QueueUrls.length === 1) {
        debug('SQS queue created:', queueName);
        ok = true;
        break;
      } else {
        await sleep(10 * 1000);
        waited += 10 * 1000;
      }
    } catch (err) {
      await sleep(10 * 1000);
      waited += 10 * 1000;
    }
  }

  if (!ok) {
    debug('Time out waiting for SQS queue:', queueName);
    throw new Error('SQS queue could not be created');
  }
}

async function getManifest(context) {
  try {
    const testBundle = new TestBundle(
      context.namedTest ? context.s3Prefix : context.testId
    );
    const metadata = await testBundle.getManifest();

    context.newScriptPath = metadata.scriptPath;

    if (metadata.configPath) {
      context.configPath = metadata.configPath;
    }

    return context;
  } catch (err) {
    if (err.code === 'NoSuchKey') {
      throw new TestNotFoundError();
    } else {
      throw err;
    }
  }
}

async function generateTaskOverrides(context) {
  const cliArgs = ['run'].concat(
    context.cliOptions.environment
      ? ['--environment', context.cliOptions.environment]
      : [],
    context.cliOptions['scenario-name']
      ? ['--scenario-name', context.cliOptions['scenario-name']]
      : [],
    context.cliOptions.insecure ? ['-k'] : [],
    context.cliOptions.target ? ['-t', context.cliOptions.target] : [],
    context.cliOptions.overrides
      ? ['--overrides', context.cliOptions.overrides]
      : [],
    context.cliOptions.variables
      ? ['--variables', context.cliOptions.variables]
      : [],
    context.configPath ? ['--config', context.configPath] : []
  );
  // NOTE: This MUST come last:
  cliArgs.push(context.newScriptPath);

  debug('cliArgs', cliArgs, cliArgs.join(' '));

  const s3path = `s3://${context.s3Bucket}/tests/${
    context.namedTest ? context.s3Prefix : context.testId
  }`;
  const adotOverride = [
    {
      name: 'adot-collector',
      environment: []
    }
  ];

  const overrides = {
    containerOverrides: [
      {
        name: 'artillery',
        command: [
          '-p',
          s3path,
          '-a',
          util.btoa(JSON.stringify(cliArgs)),
          '-r',
          context.region,
          '-q',
          process.env.SQS_QUEUE_URL || context.sqsQueueUrl,
          '-i',
          context.testId,
          '-d',
          `s3://${context.s3Bucket}/test-runs`,
          '-t',
          String(WAIT_TIMEOUT)
        ],
        environment: [
          {
            name: 'AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE',
            value: '1'
          },
          {
            name: 'ARTILLERY_TEST_RUN_ID',
            value: global.artillery.testRunId
          }
        ]
      },
      ...(context.adot ? adotOverride : [])
    ],
    taskRoleArn: context.taskRoleArn
  };

  if (context.customRoleArn) {
    overrides.taskRoleArn = context.customRoleArn;
  }

  if (context.cliOptions.taskEphemeralStorage) {
    overrides.ephemeralStorage = {
      sizeInGiB: context.cliOptions.taskEphemeralStorage
    };
  }

  overrides.containerOverrides[0].environment.push({
    name: 'USE_V2',
    value: 'true'
  });

  if (context.dotenv) {
    let extraEnv = [];
    for (const [name, value] of Object.entries(context.dotenv)) {
      extraEnv.push({ name, value });
    }
    overrides.containerOverrides[0].environment =
      overrides.containerOverrides[0].environment.concat(extraEnv);
    if (overrides.containerOverrides[1]) {
      overrides.containerOverrides[1].environment =
        overrides.containerOverrides[1].environment.concat(extraEnv);
    }
  }

  if (context.cliOptions.launchConfig) {
    const lc = context.cliOptions.launchConfig;
    if (lc.environment) {
      overrides.containerOverrides[0].environment =
        overrides.containerOverrides[0].environment.concat(lc.environment);
      if (overrides.containerOverrides[1]) {
        overrides.containerOverrides[1].environment =
          overrides.containerOverrides[1].environment.concat(lc.environment);
      }
    }

    //
    // Not officially supported:
    //
    if (lc.taskRoleArn) {
      overrides.taskRoleArn = lc.taskRoleArn;
    }
    if (lc.command) {
      overrides.containerOverrides[0].command = lc.command;
    }
  }

  debug('OK: Overrides generated');
  debugVerbose(JSON.stringify(overrides, null, 4));

  context.taskOverrides = overrides;

  return context;
}

async function setupDefaultECSParams(context) {
  const defaultParams = {
    taskDefinition: context.taskName,
    cluster: context.clusterName,
    overrides: context.taskOverrides
  };

  if (context.isFargate) {
    if (context.isCapacitySpot) {
      defaultParams.capacityProviderStrategy = [
        {
          capacityProvider: 'FARGATE_SPOT',
          weight: 1,
          base: 0
        }
      ];
    } else {
      // On-demand capacity
      defaultParams.launchType = 'FARGATE';
    }
    // Networking config: private subnets of the VPC that the ECS cluster
    // is in. Don't need public subnets.
    defaultParams.networkConfiguration = {
      awsvpcConfiguration: {
        // https://github.com/aws/amazon-ecs-agent/issues/1128
        assignPublicIp: 'ENABLED',
        securityGroups: context.fargateSecurityGroupIds,
        subnets: context.fargatePublicSubnetIds
      }
    };
  } else {
    defaultParams.launchType = 'EC2';
  }

  context.defaultECSParams = defaultParams;
  return context;
}

async function launchLeadTask(context) {
  const metadata = {
    testId: context.testId,
    startedAt: Date.now(),
    cluster: context.clusterName,
    region: context.region,
    launchType: context.cliOptions.launchType,
    isFargateSpot: context.isCapacitySpot,
    count: context.count,
    sqsQueueUrl: context.sqsQueueUrl,
    tags: context.tags,
    secrets: JSON.stringify(
      Array.isArray(context.extraSecrets)
        ? context.extraSecrets
        : [context.extraSecrets]
    ),
    platformConfig: JSON.stringify({
      memory: context.taskDefinition.containerDefinitions[0].memory,
      cpu: context.taskDefinition.containerDefinitions[0].cpu
    }),
    artilleryVersion: JSON.stringify({
      core: global.artillery.version
    }),
    // Properties from the runnable script object:
    testConfig: {
      target: context.runnableScript.config.target,
      phases: context.runnableScript.config.phases,
      plugins: context.runnableScript.config.plugins,
      environment: context.runnableScript._environment,
      scriptPath: context.runnableScript._scriptPath,
      configPath: context.runnableScript._configPath
    }
  };

  artillery.globalEvents.emit('metadata', metadata);

  context.status = TEST_RUN_STATUS.LAUNCHING_WORKERS;

  const ecs = new AWS.ECS({ apiVersion: '2014-11-13', region: context.region });

  const leaderParams = Object.assign(
    { count: 1 },
    JSON.parse(JSON.stringify(context.defaultECSParams))
  );
  leaderParams.overrides.containerOverrides[0].environment.push({
    name: 'IS_LEADER',
    value: 'true'
  });

  try {
    const runData = await ecs.runTask(leaderParams).promise();
    if (runData.failures.length > 0) {
      if (runData.failures.length === context.count) {
        artillery.log('ERROR: Worker start failure');
        const uniqueReasons = [
          ...new Set(runData.failures.map((f) => f.reason))
        ];
        artillery.log('Reason:', uniqueReasons);
        throw new Error('Could not start workers');
      } else {
        artillery.log('WARNING: Some workers failed to start');
        artillery.log(chalk.red(JSON.stringify(runData.failures, null, 4)));
        throw new Error('Not enough capacity - terminating');
      }
    }

    context.taskArns = context.taskArns.concat(
      runData.tasks.map((task) => task.taskArn)
    );
    artillery.globalEvents.emit('metadata', {
      platformMetadata: { taskArns: context.taskArns }
    });
  } catch (runErr) {
    throw runErr;
  }

  return context;
}

// TODO: When launching >20 containers on Fargate, adjust WAIT_TIMEOUT dynamically to
// add extra time spent in waiting between runTask calls: WAIT_TIMEOUT + worker_count.
async function ecsRunTask(context) {
  const ecs = new AWS.ECS({ apiVersion: '2014-11-13', region: context.region });
  let tasksRemaining = context.count - 1;
  let retries = 0;

  while (
    tasksRemaining > 0 &&
    context.status !== TEST_RUN_STATUS.TERMINATING &&
    context.status !== TEST_RUN_STATUS.EARLY_STOP
  ) {
    if (retries >= 10) {
      artillery.log('Max retries for ECS (10) exceeded');
      throw new Error('Max retries exceeded');
    }

    let launchCount = tasksRemaining <= 10 ? tasksRemaining : 10;
    let params = Object.assign(
      { count: launchCount },
      JSON.parse(JSON.stringify(context.defaultECSParams))
    );

    params.overrides.containerOverrides[0].environment.push({
      name: 'IS_LEADER',
      value: 'false'
    });

    try {
      const runData = await ecs.runTask(params).promise();
      if (runData.failures.length > 0) {
        artillery.log('Some workers failed to start');
        const uniqueReasons = [
          ...new Set(runData.failures.map((f) => f.reason))
        ];
        artillery.log(chalk.red(uniqueReasons));
        artillery.log('Retrying...');
        await sleep(10 * 1000);
        throw new Error('Not enough ECS capacity');
      }

      if (runData.tasks?.length > 0) {
        const newTaskArns = runData.tasks.map((task) => task.taskArn);
        context.taskArns = context.taskArns.concat(newTaskArns);
        artillery.globalEvents.emit('metadata', {
          platformMetadata: { taskArns: newTaskArns }
        });
        debug(`Launched ${launchCount} tasks`);
        tasksRemaining -= launchCount;
        await sleep(250);
      } else {
        retries++;
      }
    } catch (runErr) {
      if (runErr.code === 'ThrottlingException') {
        artillery.log('ThrottlingException returned from ECS, retrying');
        await sleep(2000 * retries);
        debug('runTask throttled, retrying');
        debug(runErr);
      } else if (runErr.message.match(/Not enough ECS capacity/gi)) {
        // Do nothing
      } else {
        artillery.log(runErr);
      }

      retries++;
      if (retries >= 10) {
        artillery.log('Max retries for ECS (10) exceeded');
        throw runErr;
      }
    }
  }
  return context;
}

async function waitForTasks2(context) {
  const ecs = new AWS.ECS({ apiVersion: '2014-11-13', region: context.region });

  const params = {
    tasks: context.taskArns,
    cluster: context.clusterName
  };

  let failedTasks = [];
  let stoppedTasks = [];
  let maybeErr = null;

  const silentWaitTimeout = new Timeout(30 * 1000).start(); // wait this long before updating the user
  const waitTimeout = new Timeout(60 * 1000).start(); // wait for up to 1 minute
  while (context.status !== TEST_RUN_STATUS.TERMINATING) {
    let ecsData;
    try {
      ecsData = await awsUtil.ecsDescribeTasks(params, ecs);
    } catch (err) {
      // TODO: Inspect err for any conditions in which we may want to abort immediately.
      // Otherwise, let the timeout run to completion.
      debug(err);
      await sleep(5000);
      continue;
    }

    // All tasks are RUNNING, proceed:
    if (_.every(ecsData.tasks, (s) => s.lastStatus === 'RUNNING')) {
      logProgress('All workers started...');
      debug('All tasks in RUNNING state');
      break;
    }

    // If there are STOPPED tasks, we need to stop:
    stoppedTasks = ecsData.tasks.filter((t) => t.lastStatus === 'STOPPED');
    if (stoppedTasks.length > 0) {
      debug('Some tasks in STOPPED state');
      debugErr(stoppedTasks);
      // TODO: Stop RUNNING tasks and clean up (release queue lock, deregister task definition)
      // TODO: Provide more information here, e.g. task ARNs, or CloudWatch log group ID
      maybeErr = new Error('Worker init failure, aborting test');
      break;
    }

    // If some tasks failed to start altogether, abort:
    if (ecsData.failures.length > 0) {
      failedTasks = ecsData.failures;
      debug('Some tasks failed to start');
      debugErr(ecsData.failures);
      maybeErr = new Error('Worker start up failure, aborting test');
      break;
    }

    // If there are PENDING, update progress bar
    debug('Waiting on pending tasks');
    if (silentWaitTimeout.timedout()) {
      const statusCounts = _.countBy(ecsData.tasks, 'lastStatus');
      let statusSummary = _.map(statusCounts, (count, status) => {
        const displayStatus =
          status === 'RUNNING' ? 'ready' : status.toLowerCase();
        let displayStatusChalked = displayStatus;
        if (displayStatus === 'ready') {
          displayStatusChalked = chalk.green(displayStatus);
        } else if (displayStatus === 'pending') {
          displayStatusChalked = chalk.yellow(displayStatus);
        }

        return `${displayStatusChalked}: ${count}`;
      }).join(' / ');

      logProgress('Waiting for workers to start: ' + statusSummary);
    }

    if (waitTimeout.timedout()) {
      // TODO: Clean up RUNNING tasks etc
      break;
    }
    await sleep(10 * 1000);
  } // while
  waitTimeout.stop();

  if (maybeErr) {
    if (stoppedTasks.length > 0) {
      artillery.log(stoppedTasks);
    }
    if (failedTasks.length > 0) {
      artillery.log(failedTasks);
    }
    throw maybeErr;
  }

  return context;
}

async function waitForWorkerSync(context) {
  return new Promise((resolve, reject) => {
    const MAGIC_PREFIX = 'synced_';
    const prefix = `test-runs/${context.testId}/${MAGIC_PREFIX}`;

    const intervalSec = 10;
    const times = WAIT_TIMEOUT / intervalSec;

    A.retry(
      { times: times, interval: intervalSec * 1000 },
      // we wrap the function since async#retry will retry ONLY when an
      // error is returned
      function wrapForRetry(next) {
        util.listAllObjectsWithPrefix(
          context.s3Bucket,
          prefix,
          (err, objects) => {
            // NOTE: err here is an S3 error
            if (err) {
              next(err);
            } else {
              debug({ objects });

              // TODO: context.count is how many we requested, but we need to handle the case when not everything started
              if (objects.length !== context.count) {
                debug(
                  `expected ${context.count} sync acks but got ${objects.length}`
                );
                // this tells async#retry to retry
                return next(new Error('Timed out waiting for workers to sync'));
              } else {
                return next(null);
              }
            }
          }
        );
      },
      (err) => {
        if (err) {
          return reject(err);
        } else {
          debug('all workers synced');
          return resolve(context);
        }
      }
    ); // A.retry
  });
}

async function sendGoSignal(context) {
  const s3 = createS3Client();
  try {
    await s3
      .putObject({
        Body: context.testId,
        Bucket: context.s3Bucket,
        Key: `test-runs/${context.testId}/go.json`
      })
      .promise();
  } catch (err) {
    throw err;
  }

  return context;
}

async function listen(context, ee) {
  return new Promise((resolve, _reject) => {
    context.intermediateReports = [];
    context.aggregateReport = null;

    const r = new SqsReporter(context);
    context.sqsReporter = r;
    r.on('workersDone', (state) => {
      ee.emit('workersDone', state);
      return resolve(context);
    });
    r.on('done', (stats) => {
      if (stats.report) {
        context.aggregateReport = stats.report();
      } else {
        context.aggregateReport = stats;
      }

      global.artillery.globalEvents.emit('done', stats);
      ee.emit('done', stats);
    });
    r.on('error', (err) => {
      // Ignore SQS errors
      // ee.emit('error', err);
      // return reject(err);
      debug(err);
    });

    r.on('workerDone', (body, attrs) => {
      if (process.env.LOG_WORKER_MESSAGES) {
        artillery.log(
          chalk.green(
            `[${attrs.workerId.StringValue} ${JSON.stringify(body, null, 4)}]`
          )
        );
      }
    });
    r.on('workerError', (body, attrs) => {
      if (process.env.LOG_WORKER_MESSAGES) {
        artillery.log(
          chalk.red(
            `[${attrs.workerId.StringValue} ${JSON.stringify(body, null, 4)}]`
          )
        );
      }
      if (body.exitCode != 21) {
        artillery.log(
          chalk.yellow(
            `Worker exited with an error, worker ID = ${attrs.workerId.StringValue}`
          )
        );
      }

      // TODO: Copy log over and print path to log file so that user may inspect it - in a temporary location
      global.artillery.suggestedExitCode = body.exitCode || 1;
    });

    r.on('workerMessage', (body, attrs) => {
      if (process.env.LOG_WORKER_MESSAGES) {
        artillery.log(
          chalk.yellow(
            `[${attrs.workerId.StringValue}] ${body.msg} ${body.type}`
          )
        );
      }

      if (body.type === 'stopped') {
        if (context.status !== TEST_RUN_STATUS.EARLY_STOP) {
          artillery.log('Test run has been requested to stop');
        }
        context.status = TEST_RUN_STATUS.EARLY_STOP;
      }

      if (body.type === 'ensure') {
        try {
          context.ensureSpec = JSON.parse(util.atob(body.msg));
        } catch (parseErr) {
          console.error('Error processing ensure directive');
        }
      }

      if (body.type === 'leader' && body.msg === 'prepack_end') {
        ee.emit('prepack_end');
      }
    });

    r.on('stats', async (stats) => {
      let report;
      if (stats.report) {
        report = stats.report();
        context.intermediateReports.push(report);
      } else {
        context.intermediateReports.push(stats);
        report = stats;
      }

      global.artillery.globalEvents.emit('stats', stats);
      ee.emit('stats', stats);
    });

    r.on('phaseStarted', (phase) => {
      global.artillery.globalEvents.emit('phaseStarted', phase);
    });

    r.on('phaseCompleted', (phase) => {
      global.artillery.globalEvents.emit('phaseCompleted', phase);
    });

    r.start();
  });
}

async function deregisterTaskDefinition(context) {
  if (!context.taskDefinitionArn) {
    return;
  }

  const ecs = new AWS.ECS({ apiVersion: '2014-11-13', region: context.region });
  try {
    await ecs
      .deregisterTaskDefinition({ taskDefinition: context.taskDefinitionArn })
      .promise();
    debug(`Deregistered ${context.taskDefinitionArn}`);
  } catch (err) {
    artillery.log(err);
    debug(err);
  }

  return context;
}

// TODO: Remove - duplicated in run.js
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
