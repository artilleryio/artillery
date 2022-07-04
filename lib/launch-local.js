/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const divideWork = require('./dist');
const { SSMS } = require('../core/lib/ssms');
const { loadPlugins, loadPluginsConfig } = require('./load-plugins');

const { ArtilleryWorker } = require('./artillery-worker-local');

const EventEmitter = require('eventemitter3');
const debug = require('debug')('core');

const os = require('os');
const p = require('util').promisify;
const _ = require('lodash');

const core = require('./dispatcher');
const { handleScriptHook, prepareScript, loadProcessor } = core.runnerFuncs;

const temp = require('temp').track();
const fs = require('fs');
const { spawnSync } = require('child_process');

const { randomUUID } = require('crypto');

const sleep = require('./util/sleep');
const path = require('path');

const archiver = require('archiver');
const AWS = require('aws-sdk');

async function createLauncher(script, payload, opts, launcherOpts) {
  launcherOpts = launcherOpts || {
    platform: 'local',
    mode: 'distribute',
  };
  return new Launcher(script, payload, opts, launcherOpts);
}

class PlatformLocal {
  constructor(script, payload, opts, platformOpts) {
    // We need these to run before/after hooks:
    this.script = script;
    this.payload = payload;
    this.opts = opts;
    this.events = new EventEmitter(); // send worker events such as workerError, etc

    this.workers = {};

    return this;
  }

  async init() {
    // 'before' hook is executed in the main thread,
    // its context is then passed to the workers
    const contextVars = await this.runHook('before');
    this.contextVars = contextVars; // TODO: Rename to something more descriptive

    return contextVars;
  }

  async createWorker() {
    const worker = new ArtilleryWorker();

    await worker.init();

    const workerId = worker.workerId;
    worker.events.on('workerError', (message) => {
      this.events.emit('workerError', workerId, message);
    });
    worker.events.on('log', (message) => {
      this.events.emit('log', workerId, message);
    });
    worker.events.on('phaseStarted', (message) => {
      this.events.emit('phaseStarted', workerId, message);
    });
    worker.events.on('phaseCompleted', (message) => {
      this.events.emit('phaseCompleted', workerId, message);
    });
    worker.events.on('stats', (message) => {
      this.events.emit('stats', workerId, message);
    });
    worker.events.on('done', (message) => {
      this.events.emit('done', workerId, message);
    });
    worker.events.on('readyWaiting', (message) => {
      this.events.emit('readyWaiting', workerId, message);
    });
    worker.events.on('setSuggestedExitCode', (message) => {
      this.events.emit('setSuggestedExitCode', workerId, message);
    });

    this.workers[worker.workerId] = {
      proc: worker,
      state: worker.state, // TODO: replace with getState() use
    };

    return worker;
  }

  async prepareWorker(workerId, opts) {
    return this.workers[workerId].proc.prepare(opts);
  }

  async runWorker(workerId, contextVarsString) { // TODO: this will become opts
    debug('runWorker', workerId);
    return this.workers[workerId].proc.run(contextVarsString);

  }
  async stopWorker(workerId) {
    return this.workers[workerId].proc.stop();
  }

  async getWorkerState(workerId) {

  }

  async shutdown() {
    // 'after' hook is executed in the main thread, after all workers
    // are done
    await this.runHook('after', this.contextVars);
  }

  // ********

  async runHook(hook, initialContextVars) {
    if (!this.script[hook]) {
      return {};
    }

    const runnableScript = loadProcessor(
      prepareScript(this.script, _.cloneDeep(this.payload)),
      this.opts
    );

    const contextVars = await handleScriptHook(
      hook,
      runnableScript,
      this.events,
      initialContextVars
    );

    debug(`hook ${hook} context vars`, contextVars);

    return contextVars;
  }
}

class PlatformLambda {
  constructor(script, payload, opts, platformOpts) {
    this.workers = {};
    this.script = script;
    this.payload = payload;
    this.opts = opts;

    this.events = new EventEmitter();

    this.region = platformOpts.region;
    this.testRunId = platformOpts.testRunId || randomUUID();
    this.lambdaRoleArn = platformOpts.lambdaRoleArn;

    this.artilleryArgs = [];
  }

  async init() {
    artillery.log('Creating Lambda function');
    const dirname = temp.mkdirSync(); // TODO: May want a way to override this by the user
    const zipfile = temp.path({ suffix: 'zip' });

    debug({dirname, zipfile});

    fs.copyFileSync(path.resolve(__dirname, 'platform', 'aws-lambda', 'lambda-handler', 'index.js'), path.join(dirname, 'index.js'));
    fs.copyFileSync(path.resolve(__dirname, 'platform', 'aws-lambda', 'lambda-handler', 'package.json'), path.join(dirname, 'package.json'));
    fs.copyFileSync(this.opts.absoluteScriptPath, path.join(dirname, path.basename(this.opts.absoluteScriptPath)));
    this.artilleryArgs.push('run');
    this.artilleryArgs.push(path.basename(this.opts.absoluteScriptPath));
    // TODO: Copy script in there. Construct Artillery args.

    artillery.log('....Installing dependencies')
    const { stdout, stderr, status, error } = spawnSync('npm install', {cwd: dirname});
    artillery.log(stdout);
    artillery.log('....Creating zip package');
    await this.createZip(dirname, zipfile);

    artillery.log('Creating cloud resources')
    const bucketName = await this.ensureS3BucketExists();
    this.bucketName = bucketName;

    const s3path = await this.uploadLambdaZip(bucketName, zipfile);
    this.lambdaZipPath = s3path;

    const sqsQueueUrl = await this.createSQSQueue(this.region);
    this.sqsQueueUrl = sqsQueueUrl;


    if(typeof this.lambdaRoleArn === 'undefined') {
      const lambdaRoleArn = await this.createLambdaRole();
      this.lambdaRoleArn = lambdaRoleArn;
    }

    this.functionName = `artilleryio-${this.testRunId}`;
    await this.createLambda({
      bucketName: this.bucketName,
      functionName: this.functionName,
      zipPath: this.lambdaZipPath,
    });

    // Start SQS watcher here, emit events

    debug({ bucketName, s3path, arn, sqsQueueUrl });
  }

  async createWorker() {
    const workerId = randomUUID();

    return workerId;
  }

  async prepareWorker(workerId) {
  }

  async runWorker(workerId) {
    const lambda = new AWS.Lambda({ apiVersion: '2015-03-31', region: this.region });
    const event = {
      SQS_QUEUE_URL: this.sqsQueueUrl,
      SQS_REGION: this.region,
      WORKER_ID: workerId,
      ARTILLERY_ARGS: this.artilleryArgs,
    };
    const args = Buffer.from(event);

    await lambda.invokeAsync({
      FunctionName: this.functionName,
      InvokeArgs: args,
    }).promise();
  }

  async stopWorker(workerId) {
    // TODO: Send message to that worker and have it exit early
  }

  async shutdown() {
    const s3 = new AWS.S3();
    const sqs = new AWS.SQS({ region: this.region });

    try {
      await s3.deletObject({
        Bucket: this.bucketName,
        Key: this.lambdaZipPath,
      }).promise();

      await sqs.deleteQueue({
        QueueUrl: this.sqsQueueUrl,
      }).promise();
    } catch (err) {
      artillery.log(err);
    }
  }

  // ...........
  async createZip(src, out) {
    const archive = archiver('zip', { zlib: { level: 9 }});
    const stream = fs.createWriteStream(out);

    return new Promise((resolve, reject) => {
      archive
        .directory(src, false)
        .on('error', err => reject(err))
        .pipe(stream)
      ;

      stream.on('close', () => resolve());
      archive.finalize();
    });
  }

  // TODO: reusable platform util
  async ensureS3BucketExists() {
    const accountId = await this.getAccountId();
    const bucketName = `artilleryio-test-data-${accountId}`;
    const s3 = new AWS.S3();

    try {
      await s3.listObjectsV2({Bucket: bucketName, MaxKeys: 1}).promise();
    } catch (s3Err) {
      if (s3Err.code === 'NoSuchBucket') {
        const res = await s3.createBucket({ Bucket: bucketName }).promise();
      } else {
        throw s3Err;
      }
    }

    return bucketName;
  }

  // TODO: reusable platform util
  async getAccountId() {
    let stsOpts = {};
    if(process.env.ARTILLERY_STS_OPTS) {
      stsOpts = Object.assign(stsOpts, JSON.parse(process.env.ARTILLERY_STS_OPTS));
    }

    const sts = new AWS.STS(stsOpts);
    const awsAccountId = (await sts.getCallerIdentity({}).promise()).Account;
    return awsAccountId;
  }


  // TODO: Add timestamp to SQS queue name. Then can GC automatically later - anything older than 24 hours.
  async createSQSQueue() {
    const sqs = new AWS.SQS({
      region: this.region,
    });

    const SQS_QUEUES_NAME_PREFIX = 'artilleryio_test_metrics';

    // 36 is length of a UUUI v4 string
    const queueName = `${SQS_QUEUES_NAME_PREFIX}_${this.testRunId.slice(0, 36)}.fifo`;
    const params = {
      QueueName: queueName,
      Attributes: {
        FifoQueue: 'true',
        ContentBasedDeduplication: 'false',
        MessageRetentionPeriod: '1800',
        VisibilityTimeout: '600' // 10 minutes
      }
    };

    let sqsQueueUrl;
    try {
      const result = await sqs.createQueue(params).promise();
      sqsQueueUrl = result.QueueUrl;
    } catch (err) {
      throw err;
    }

    // Wait for the queue to be available:
    let waited = 0;
    let ok = false;
    while (waited < 120 * 1000) {
      try {
        const results = await sqs.listQueues({ QueueNamePrefix: queueName }).promise();
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

    if(!ok) {
      debug('Time out waiting for SQS queue:', queueName);
      throw new Error(`SQS queue could not be created`);
    }

    return sqsQueueUrl;
  }

  async createLambdaRole() {
    const ROLE_NAME = 'artilleryio-default-lambda-role';

    const iam = new AWS.IAM();

    try {
      const res = await iam.getRole({RoleName: ROLE_NAME}).promise();
      return res.Role.Arn
    } catch (err) {
      debug(err);
    }

    const res = await iam.createRole({
      AssumeRolePolicyDocument: `{
        "Version": "2012-10-17",
        "Statement": [
          {
            "Effect": "Allow",
            "Principal": {
              "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
          }
        ]
      }`,
      Path: '/',
      RoleName: ROLE_NAME,
    }).promise();

    const lambdaRoleArn = res.Role.Arn;

    await iam.attachRolePolicy({
      PolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
      RoleName: ROLE_NAME,
    }).promise();

    return lambdaRoleArn;
  }

  async createLambda(opts) {
    const { bucketName, functionName, zipPath } = opts;

    const lambda = new AWS.Lambda({ apiVersion: '2015-03-31', region: this.region });
    const res = await lambda.createFunction({
      Code: {
        S3Bucket: bucketName,
        S3Key: zipPath,
      },
      FunctionName: functionName,
      Description: 'Artillery.io test',
      Handler: 'index.handler',
      MemorySize: 1024,
      PackageType: 'Zip',
      Runtime: 'nodejs16.x',
      Timeout: 900,
      // VpcConfig: {
      //   SecurityGroupIds: [],
      //   SubnetIds: [],
      // },
      Role: this.lambdaRoleArn,
    }).promise();
  }

  async uploadLambdaZip(bucketName, zipfile) {
    const key = `lambda/${randomUUID}.zip`;
    // TODO: upload to a prefix
    // Set lifecycle policy on that prefix - delete after 24 hours
    const s3 = new AWS.S3();
    const s3res = await s3.putObject({
      Body: fs.createReadStream(zipfile),
      Bucket: bucketName,
      Key: key,
    }).promise();

    return key;
  }
}

class LambdaWorker {
  constructor() {

  }

  async init() {
  }

  async prepare() {
    // nothing to do
  }

  async run() {
    // spawn a lambda - but we don't know what it is. ie this needs to be done by Platform
    // all of the operations here need to be done through Platform methods
  }

  async stop() {

  }
}

class Launcher {
  constructor(script, payload, opts, launcherOpts) {
    this.script = script;
    this.payload = payload;
    this.opts = opts;

    this.workers = {};
    this.workerMessageBuffer = [];

    this.metricsByPeriod = {};
    this.finalReportsByWorker = {};

    this.events = new EventEmitter();

    this.pluginEvents = new EventEmitter();
    this.pluginEventsLegacy = new EventEmitter();

    if (launcherOpts.platform === 'local') {
      this.count = this.opts.count || Math.max(1, os.cpus().length - 1);
      debug('Worker thread count:', this.count);
    }

    if (launcherOpts.platform === 'local') {
      this.platform = new PlatformLocal(script, payload, opts);
    } else { // aws:lambda
      this.platform = new PlatformLambda(script, payload, opts, launcherOpts);
    }

    if (launcherOpts.mode === 'distribute') {
      this.workerScripts = divideWork(this.script, this.count);
      this.count = this.workerScripts.length;
    }

    this.phaseStartedEventsSeen = {};
    this.phaseCompletedEventsSeen = {};

    // this.eventBus = new EventEmitter();

    this.eventsByWorker = {};

    return this;
  }

  async initWorkerEvents(workerEvents) {
    workerEvents.on('workerError', (workerId, message) => {
      const { id, error, level, aggregatable } = message;
      if (aggregatable) {
        this.workerMessageBuffer.push(message);
      } else {
        global.artillery.log(`[${id}]: ${error.message}`, level);
      }
    });

    // TODO: We might want to expose workerPhaseStarted/Completed events

    workerEvents.on('phaseStarted', (workerId, message) => {
      // Note - we send only the first event for a phase, not all of them
      if (
        typeof this.phaseStartedEventsSeen[message.phase.index] === 'undefined'
      ) {
        this.phaseStartedEventsSeen[message.phase.index] = Date.now();
        this.events.emit('phaseStarted', message.phase);
        this.pluginEvents.emit('phaseStarted', message.phase);
      }
    });

    workerEvents.on('phaseCompleted', (workerId, message) => {
      if (
        typeof this.phaseCompletedEventsSeen[message.phase.index] ===
        'undefined'
      ) {
        this.phaseCompletedEventsSeen[message.phase.index] = Date.now();
        this.events.emit('phaseCompleted', message.phase);
        this.pluginEvents.emit('phaseCompleted', message.phase);
      }
    });

    // We are not going to receive stats events from workers
    // which have zero arrivals for a phase. (This can only happen
    // in "distribute" mode.)
    workerEvents.on('stats', (workerId, message) => {
      const workerStats = SSMS.deserializeMetrics(message.stats);
      const period = workerStats.period;
      if (typeof this.metricsByPeriod[period] === 'undefined') {
        this.metricsByPeriod[period] = [];
      }
      // TODO: might want the full message here, with worker ID etc
      this.metricsByPeriod[period].push(workerStats);
    });

    workerEvents.on('done', async (workerId, message) => {
      this.workers[message.id].state = 'exited'; // TODO:

      this.finalReportsByWorker[message.id] = SSMS.deserializeMetrics(
        message.report
      );

      if (Object.keys(this.finalReportsByWorker).length === this.count) {
        // Flush messages from workers
        await this.flushWorkerMessages(0);
        await this.flushIntermediateMetrics(true);

        // TODO: handle worker death

        const pds = Object.keys(this.finalReportsByWorker).map(
          (k) => this.finalReportsByWorker[k]
        );

        const statsByPeriod = Object.values(SSMS.mergeBuckets(pds));
        const stats = SSMS.pack(statsByPeriod);

        stats.summaries = {};
        for (const [name, value] of Object.entries(stats.histograms || {})) {
          const summary = SSMS.summarizeHistogram(value);
          stats.summaries[name] = summary;
        }

        // Relay event to workers
        this.pluginEvents.emit('done', stats);
        this.pluginEventsLegacy.emit('done', SSMS.legacyReport(stats));

        this.events.emit('done', stats);
      }
    });

    workerEvents.on('log', async (workerId, message) => {
      artillery.globalEvents.emit('log', ...message.args);
    });

    workerEvents.on('setSuggestedExitCode', (workerId, message) => {
      artillery.suggestedExitCode = message.code;
    });
  }

  async initPlugins() {
    const plugins = await loadPlugins(
      this.script.config.plugins,
      this.script,
      this.opts
    );

    //
    // init plugins
    //
    for (const [name, result] of Object.entries(plugins)) {
      if (result.isLoaded) {
        if (result.version === 3) {
          // TODO: load the plugin, subscribe to events
          // global.artillery.plugins[name] = result.plugin;
        } else {
          //           global.artillery.log(`WARNING: Legacy plugin detected: ${name}
          // See https://artillery.io/docs/resources/core/v2.html for more details.`,
          //                                'warn');

          // NOTE:
          // We are giving v1 and v2 plugins a throw-away script
          // object because we only care about the plugin setting
          // up event handlers here. The plugins will be loaded
          // properly in individual workers where they will have the
          // opportunity to attach custom code, modify the script
          // object etc.
          // If we let a plugin access to the actual script object,
          // and it happens to attach code to it (with a custom
          // processor function for example) - spawning a worker
          // will fail.
          const dummyScript = JSON.parse(JSON.stringify(this.script));
          dummyScript.config = {
            ...dummyScript.config,
            // Load additional plugins configuration from the environment
            plugins: loadPluginsConfig(this.script.config.plugins)
          };

          if (result.version === 1) {
            result.plugin = new result.PluginExport(
              dummyScript.config,
              this.pluginEventsLegacy
            );
            global.artillery.plugins.push(result);
          } else if (result.version === 2) {
            if (result.PluginExport.LEGACY_METRICS_FORMAT === false) {
              result.plugin = new result.PluginExport.Plugin(
                dummyScript,
                this.pluginEvents,
                this.opts
              );
            } else {
              result.plugin = new result.PluginExport.Plugin(
                dummyScript,
                this.pluginEventsLegacy,
                this.opts
              );
            }
            global.artillery.plugins.push(result);
          } else {
            // TODO: print warning
          }
        }
      } else {
        global.artillery.log(`WARNING: Could not load plugin: ${name}`, 'warn');
        global.artillery.log(result.msg, 'warn');
        // global.artillery.log(result.error, 'warn');
      }
    }
  }

  async flushWorkerMessages(maxAge = 9000) {
    // Collect messages older than maxAge msec and group by log message:
    const now = Date.now();
    const okToPrint = this.workerMessageBuffer.filter(
      (m) => now - m.ts > maxAge
    );
    this.workerMessageBuffer = this.workerMessageBuffer.filter(
      (m) => now - m.ts <= maxAge
    );

    const readyMessages = okToPrint.reduce((acc, message) => {
      const { error } = message;
      // TODO: Take event type and level into account
      if (typeof acc[error.message] === 'undefined') {
        acc[error.message] = [];
      }
      acc[error.message].push(message);
      return acc;
    }, {});

    for (const [logMessage, messageObjects] of Object.entries(readyMessages)) {
      if (messageObjects[0].error) {
        global.artillery.log(
          `[${messageObjects[0].id}] ${messageObjects[0].error.message}`,
          messageObjects[0].level
        );
      } else {
        // Expect a msg property:
        global.artillery.log(
          `[${messageObjects[0].id}] ${messageObjects[0].msg}`,
          messageObjects[0].level
        );
      }
    }
  }

  async flushIntermediateMetrics(flushAll = false) {
    // NOTE: We simply print everything we have for a reporting window
    // older than 20 seconds. We aren't concerned with making sure that
    // we have metrics objects from each running/non-idle worker.
    for (const [period, metricObjects] of Object.entries(
      this.metricsByPeriod
    )) {
      const now = flushAll ? Date.now() * 10 : Date.now();
      if (now - Number(period) > 20000) {
        const stats = SSMS.mergeBuckets(this.metricsByPeriod[period])[
          String(period)
        ];
        // summarize histograms for console reporter
        stats.summaries = {};
        for (const [name, value] of Object.entries(stats.histograms || {})) {
          const summary = SSMS.summarizeHistogram(value);
          stats.summaries[name] = summary;
        }

        // Relay event to workers
        this.pluginEvents.emit('stats', stats);
        this.pluginEventsLegacy.emit('stats', SSMS.legacyReport(stats));

        this.events.emit('stats', stats);

        delete this.metricsByPeriod[period];
      }
    }
  }

  async run() {
    await this.initPlugins();

    setInterval(async () => {
      await this.flushWorkerMessages();
    }, 1 * 1000).unref();

    setInterval(async () => {
      this.flushIntermediateMetrics();
    }, 900).unref();


    const contextVars = await this.platform.init();

    for (const script of this.workerScripts) {
      const w1 = await this.platform.createWorker(); // new ArtilleryWorker();

      // await w1.init();

      this.workers[w1.workerId] = {
        id: w1.workerId,
        // proc: w1,
        // state: w1.state,
        script
      };
      debug(`worker init ok: ${w1.workerId}`);
    }

    await this.initWorkerEvents(this.platform.events);

    const prepareAll = [];
    const runAll = [];

    for (const [workerId, w] of Object.entries(this.workers)) {
      await this.platform.prepareWorker(workerId, {
            script: w.script,
            payload: this.payload,
            options: this.opts
          });
      // prepareAll.push(
      //   w.proc.prepare({
      //     script: w.script,
      //     payload: this.payload,
      //     options: this.opts
      //   })
      // );
    }
    //await Promise.all(prepareAll);
    debug('workers prepared');

    // the initial context is stringified and copied to the workers
    const contextVarsString = JSON.stringify(contextVars);

    for (const [workerId, w] of Object.entries(this.workers)) {
      await this.platform.runWorker(workerId, contextVarsString);
      //runAll.push(w.proc.run(contextVarsString));
    }

    //await Promise.all(runAll);

    debug('workers running');
  }

  async shutdown() {
    await this.platform.shutdown();

    // TODO: flush worker messages, and intermediate stats

    // Unload plugins
    // TODO: v3 plugins
    if (global.artillery && global.artillery.plugins) {
      for (const o of global.artillery.plugins) {
        if (o.plugin.cleanup) {
          try {
            await p(o.plugin.cleanup.bind(o.plugin))();
            debug('plugin unloaded:', o.name);
          } catch (cleanupErr) {
            global.artillery.log(cleanupErr, 'error');
          }
        }
      }
    }

    // Stop workers
    for (const [id, w] of Object.entries(this.workers)) {
      await this.platform.stopWorker(id);
    }
  }
}

module.exports = createLauncher;
