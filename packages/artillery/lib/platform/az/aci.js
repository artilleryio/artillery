// Copyright (c) Artillery Software Inc.
// SPDX-License-Identifier: BUSL-1.1
//
// Non-evaluation use of Artillery on Azure requires a commercial license

const { QueueConsumer } = require('./aqs-queue-consumer');
const { SQS_QUEUES_NAME_PREFIX } = require('../aws/constants');
const { DefaultAzureCredential } = require('@azure/identity');
const { QueueClient } = require('@azure/storage-queue');
const {
  ContainerInstanceManagementClient
} = require('@azure/arm-containerinstance');
const { BlobServiceClient } = require('@azure/storage-blob');
const { createTest } = require('../aws-ecs/legacy/create-test');
const util = require('../aws-ecs/legacy/util');
const generateId = require('../../util/generate-id');
const EventEmitter = require('eventemitter3');
const debug = require('debug')('platform:azure-aci');
const { IMAGE_VERSION, WAIT_TIMEOUT } = require('../aws-ecs/legacy/constants');
const { regionNames } = require('./regions');
const path = require('path');
const { Timeout, sleep } = require('../aws-ecs/legacy/time');
const dotenv = require('dotenv');
const fs = require('node:fs');
const request = require('got');

class PlatformAzureACI {
  constructor(script, variablePayload, opts, platformOpts) {
    this.script = script;
    this.variablePayload = variablePayload;
    this.opts = opts;
    this.platformOpts = platformOpts;

    this.cloudKey =
      this.platformOpts.cliArgs.key || process.env.ARTILLERY_CLOUD_API_KEY;

    this.events = new EventEmitter();

    this.testRunId = platformOpts.testRunId;

    this.workers = {};
    this.count = 0;
    this.waitingReadyCount = 0;
    this.artilleryArgs = [];

    this.azureTenantId =
      process.env.AZURE_TENANT_ID || platformOpts.platformConfig['tenant-id'];
    this.azureSubscriptionId =
      process.env.AZURE_SUBSCRIPTION_ID ||
      platformOpts.platformConfig['subscription-id'];
    this.azureClientId = process.env.AZURE_CLIENT_ID;
    this.azureClientSecret = process.env.AZURE_CLIENT_SECRET;

    this.storageAccount =
      process.env.AZURE_STORAGE_ACCOUNT ||
      platformOpts.platformConfig['storage-account'];
    this.blobContainerName =
      process.env.AZURE_STORAGE_BLOB_CONTAINER ||
      platformOpts.platformConfig['blob-container'];
    this.resourceGroupName =
      process.env.AZURE_RESOURCE_GROUP ||
      platformOpts.platformConfig['resource-group'];

    this.cpu = parseInt(platformOpts.platformConfig.cpu, 10) || 4;
    this.memory = parseInt(platformOpts.platformConfig.memory, 10) || 8;
    this.region = platformOpts.platformConfig.region || 'eastus';

    this.extraEnvVars = {};

    if (!regionNames.includes(this.region)) {
      const err = new Error(`Invalid region: ${this.region}`);
      err.code = 'INVALID_REGION';
      err.url = 'https://docs.art/az/regions';
      throw err;
    }

    if (
      !this.azureTenantId ||
      !this.azureSubscriptionId ||
      !this.azureClientId ||
      !this.azureClientSecret
    ) {
      const err = new Error('Azure credentials not found');
      err.code = 'AZURE_CREDENTIALS_NOT_FOUND';
      err.url = 'https://docs.art/az/credentials';
      throw err;
    }

    if (
      !this.storageAccount ||
      !this.blobContainerName ||
      !this.resourceGroupName
    ) {
      const err = new Error('Azure configuration not found');
      err.code = 'AZURE_CONFIG_NOT_FOUND';
      err.url = 'https://docs.art/az/configuration';
      throw err;
    }

    this.containerInstances = [];

    return this;
  }

  async init() {
    const credential = new DefaultAzureCredential();

    artillery.log('Tenant ID:', this.azureTenantId);
    artillery.log('Subscription ID:', this.azureSubscriptionId);
    artillery.log('Storage account:', this.storageAccount);
    artillery.log('Blob container:', this.blobContainerName);
    artillery.log('Resource group:', this.resourceGroupName);

    if (this.platformOpts.count > 5) {
      const ok = await this.checkLicense();
      if (!ok) {
        console.log();
        console.log(`
+--------------------------------------------------+
| License for Azure integration not found          |
|                                                  |
| Load tests on Azure are limited to a maximum of  |
| 5 workers without a valid license.               |
| See https://docs.art/az/license for more details |
+--------------------------------------------------+
`);
        throw new Error('ERR_LICENSE_REQUIRED');
      }
    }
    //
    // Upload test bundle
    //

    this.blobServiceClient = new BlobServiceClient(
      `https://${this.storageAccount}.blob.core.windows.net`,
      credential
    );
    this.blobContainerClient = this.blobServiceClient.getContainerClient(
      this.blobContainerName
    );

    const customSyncClient = {
      send: async (command) => {
        // command is always an instance of PutObjectCommand() from @aws-sdk/client-s3
        const { Key, Body } = command.input;
        const blockBlobClient =
          this.blobContainerClient.getBlockBlobClient(Key);
        await blockBlobClient.upload(Body, Body.length);
      }
    };

    const { manifest } = await createTest(this.opts.absoluteScriptPath, {
      name: this.testRunId,
      config: this.platformOpts.cliArgs.config,
      flags: this.platformOpts.cliArgs,
      customSyncClient
    });

    //
    // Create the queue
    //
    this.queueName = `${SQS_QUEUES_NAME_PREFIX}_${this.testRunId}.`
      .replaceAll('_', '-')
      .slice(0, 63);
    this.queueUrl =
      process.env.AZURE_STORAGE_QUEUE_URL ||
      `https://${this.storageAccount}.queue.core.windows.net/${this.queueName}`;
    const queueClient = new QueueClient(this.queueUrl, credential);
    await queueClient.create();
    this.aqsClient = queueClient;

    // Construct CLI args for the container

    this.artilleryArgs = [];
    this.artilleryArgs.push('run');

    if (this.platformOpts.cliArgs.environment) {
      this.artilleryArgs.push('-e');
      this.artilleryArgs.push(this.platformOpts.cliArgs.environment);
    }
    if (this.platformOpts.cliArgs.solo) {
      this.artilleryArgs.push('--solo');
    }

    if (this.platformOpts.cliArgs.target) {
      this.artilleryArgs.push('--target');
      this.artilleryArgs.push(this.platformOpts.cliArgs.target);
    }

    if (this.platformOpts.cliArgs.variables) {
      this.artilleryArgs.push('-v');
      this.artilleryArgs.push(this.platformOpts.cliArgs.variables);
    }

    if (this.platformOpts.cliArgs.overrides) {
      this.artilleryArgs.push('--overrides');
      this.artilleryArgs.push(this.platformOpts.cliArgs.overrides);
    }

    if (this.platformOpts.cliArgs.dotenv) {
      const dotEnvPath = path.resolve(
        process.cwd(),
        this.platformOpts.cliArgs.dotenv
      );
      const contents = fs.readFileSync(dotEnvPath);
      const envVars = dotenv.parse(contents);
      this.extraEnvVars = Object.assign({}, this.extraEnvVars, envVars);
    }

    if (this.platformOpts.cliArgs['scenario-name']) {
      this.artilleryArgs.push('--scenario-name');
      this.artilleryArgs.push(this.platformOpts.cliArgs['scenario-name']);
    }

    if (this.platformOpts.cliArgs.config) {
      this.artilleryArgs.push('--config');
      const p = manifest.files.filter(
        (x) => x.orig === this.opts.absoluteConfigPath
      )[0];
      this.artilleryArgs.push(p.noPrefixPosix);
    }

    if (this.platformOpts.cliArgs.quiet) {
      this.artilleryArgs.push('--quiet');
    }

    // This needs to be the last argument for now:
    const p = manifest.files.filter(
      (x) => x.orig === this.opts.absoluteScriptPath
    )[0];
    this.artilleryArgs.push(p.noPrefixPosix);

    const poolSize =
      typeof process.env.CONSUMER_POOL_SIZE !== 'undefined'
        ? parseInt(process.env.CONSUMER_POOL_SIZE, 10)
        : Math.max(Math.ceil(this.count / 25), 5);

    const consumer = new QueueConsumer(
      { poolSize },
      {
        queueUrl: process.env.AZURE_STORAGE_QUEUE_URL || this.queueUrl,
        handleMessage: async (message) => {
          let payload = null;
          let attributes = null;
          try {
            const result = JSON.parse(message.Body);
            payload = result.payload;
            attributes = result.attributes;
          } catch (parseErr) {
            console.error(parseErr);
            console.error(message.Body);
          }

          if (process.env.LOG_QUEUE_MESSAGES) {
            console.log(message);
          }

          if (!payload) {
            throw new Error('AQS message with an empty body');
          }

          if (!attributes || !attributes.testId || !attributes.workerId) {
            throw new Error('AQS message with no testId or workerId');
          }

          if (this.testRunId !== attributes.testId) {
            throw new Error('AQS message for an unknown testId');
          }

          const workerId = attributes.workerId;
          if (payload.event === 'workerStats') {
            this.events.emit('stats', workerId, payload);
          } else if (payload.event === 'artillery.log') {
            console.log(payload.log);
          } else if (payload.event === 'done') {
            // 'done' handler in Launcher exects the message argument to have an "id" and "report" fields
            payload.id = workerId;
            payload.report = payload.stats;
            this.events.emit('done', workerId, payload);
          } else if (
            payload.event === 'phaseStarted' ||
            payload.event === 'phaseCompleted'
          ) {
            payload.id = workerId;
            this.events.emit(payload.event, workerId, { phase: payload.phase });
          } else if (payload.event === 'workerError') {
            global.artillery.suggestedExitCode = payload.exitCode || 1;

            if (payload.exitCode != 21) {
              this.events.emit(payload.event, workerId, {
                id: workerId,
                error: new Error(
                  `A worker has exited with an error. Reason: ${payload.reason}`
                ),
                level: 'error',
                aggregatable: false,
                logs: payload.logs
              });
            }
          } else if (payload.event == 'workerReady') {
            this.events.emit(payload.event, workerId);
            this.waitingReadyCount++;

            // TODO: Do this only for batches of workers with "wait" option set
            if (this.waitingReadyCount === this.count) {
              await this.sendGoSignal();
            }
          } else {
            debug(payload);
          }
        }
      }
    );

    consumer.on('error', (err) => {
      console.error(err);
    });

    this.queueConsumer = consumer;

    const metadata = {
      region: this.region,
      platformConfig: {
        memory: this.memory,
        cpu: this.cpu
      }
    };
    global.artillery.globalEvents.emit('metadata', metadata);
  }

  getDesiredWorkerCount() {
    return this.platformOpts.count;
  }

  async startJob() {
    await this.init();

    console.log('Creating container instances...');

    // Create & run the leader:
    const { workerId } = await this.createWorker();
    this.workers[workerId] = { workerId };
    await this.runWorker(workerId, { isLeader: true });

    // Run the rest of the containers we need:
    for (let i = 0; i < this.platformOpts.count - 1; i++) {
      const { workerId } = await this.createWorker();
      this.workers[workerId] = { workerId };
      await this.runWorker(workerId);

      if (i > 0 && i % 10 === 0) {
        const delayMs =
          Math.floor(
            Math.random() *
              parseInt(process.env.AZURE_LAUNCH_STAGGER_SEC || '5', 10)
          ) * 1000;
        await sleep(delayMs);
      }
    }

    let instancesCreated = false;
    console.log('Waiting for Azure ACI to create container instances...');

    const containerInstanceClient = new ContainerInstanceManagementClient(
      new DefaultAzureCredential(),
      this.azureSubscriptionId
    );

    const provisioningWaitTimeout = new Timeout(WAIT_TIMEOUT * 1000).start();

    let containerGroupsInTestRun = [];
    while (true) {
      const containerGroupListResult =
        containerInstanceClient.containerGroups.listByResourceGroup(
          this.resourceGroupName
        );

      containerGroupsInTestRun = [];
      for await (const containerGroup of containerGroupListResult) {
        if (containerGroup.name.indexOf(this.testRunId) > 0) {
          containerGroupsInTestRun.push(containerGroup);
        }
      }

      const byStatus = containerGroupsInTestRun.reduce((acc, cg) => {
        if (!acc[cg.provisioningState]) {
          acc[cg.provisioningState] = 0;
        }
        acc[cg.provisioningState]++;
        return acc;
      }, {});

      if (
        (byStatus['Succeeded'] || 0) + (byStatus['Running'] || 0) ===
        this.count
      ) {
        instancesCreated = true;
        break;
      }

      if (provisioningWaitTimeout.timedout()) {
        break;
      }

      await sleep(10000);
    }

    if (instancesCreated) {
      console.log(
        'Container instances have been created. Waiting for workers to start...'
      );
      await this.queueConsumer.start();
    } else {
      console.log('Some containers instances failed to provision');
      console.log('Please see the Azure console for details');
      console.log(
        'https://portal.azure.com/#view/HubsExtension/BrowseResource/resourceType/Microsoft.ContainerInstance%2FcontainerGroups'
      );
      await global.artillery.shutdown();
    }
  }

  async shutdown() {
    this.queueConsumer.stop();
    try {
      await this.aqsClient.delete();
    } catch (_err) {}

    const credential = new DefaultAzureCredential();

    if (process.env.RETAIN_CONTAINER_INSTANCES !== 'true') {
      const containerInstanceClient = new ContainerInstanceManagementClient(
        credential,
        this.azureSubscriptionId
      );

      const containerGroupListResult =
        containerInstanceClient.containerGroups.listByResourceGroup(
          this.resourceGroupName
        );

      for await (const containerGroup of containerGroupListResult) {
        if (containerGroup.name.indexOf(this.testRunId) > 0) {
          try {
            await containerInstanceClient.containerGroups.beginDeleteAndWait(
              this.resourceGroupName,
              containerGroup.name
            );
          } catch (err) {
            console.log(err);
          }
        }
      }
    }
  }

  async sendGoSignal() {
    const Key = `tests/${this.testRunId}/go.json`;
    const blockBlobClient = this.blobContainerClient.getBlockBlobClient(Key);
    const res = await blockBlobClient.upload('', 0);
  }

  async createWorker() {
    const workerId = generateId('worker');
    return { workerId };
  }

  async runWorker(workerId, opts = { isLeader: false }) {
    const credential = new DefaultAzureCredential();

    const imageVersion =
      process.env.ARTILLERY_WORKER_IMAGE_VERSION || IMAGE_VERSION;
    const defaultArchitecture = 'x86_64';
    const containerImageURL =
      process.env.WORKER_IMAGE_URL ||
      `public.ecr.aws/d8a4z9o5/artillery-worker:${imageVersion}-${defaultArchitecture}`;

    const client = new ContainerInstanceManagementClient(
      credential,
      this.azureSubscriptionId
    );

    const environmentVariables = [
      {
        name: 'WORKER_ID_OVERRIDE',
        value: workerId
      },
      {
        name: 'ARTILLERY_TEST_RUN_ID',
        value: this.testRunId
      },
      // {
      //   name: 'DEBUGX',
      //   value: 'true',
      // },
      {
        name: 'DEBUG',
        value: 'cloud'
      },
      {
        name: 'IS_LEADER',
        value: String(opts.isLeader)
      },
      {
        name: 'AQS_QUEUE_NAME',
        value: this.queueName
      },
      {
        name: 'AZURE_STORAGE_ACCOUNT',
        value: this.storageAccount
      },
      {
        name: 'AZURE_SUBSCRIPTION_ID',
        secureValue: this.azureSubscriptionId
      },
      {
        name: 'AZURE_TENANT_ID',
        secureValue: this.azureTenantId
      },
      {
        name: 'AZURE_CLIENT_ID',
        secureValue: this.azureClientId
      },
      {
        name: 'AZURE_CLIENT_SECRET',
        secureValue: this.azureClientSecret
      },
      {
        name: 'AZURE_STORAGE_AUTH_MODE',
        value: 'login'
      }
    ];

    if (this.cloudKey) {
      environmentVariables.push({
        name: 'ARTILLERY_CLOUD_API_KEY',
        secureValue: this.cloudKey
      });
    }

    const cloudEndpoint = process.env.ARTILLERY_CLOUD_ENDPOINT;
    if (cloudEndpoint) {
      environmentVariables.push({
        name: 'ARTILLERY_CLOUD_ENDPOINT',
        secureValue: cloudEndpoint
      });
    }

    for (const [name, value] of Object.entries(this.extraEnvVars)) {
      environmentVariables.push({ name, value });
    }

    const containerGroup = {
      location: this.region,
      containers: [
        {
          name: 'artillery-worker',
          image: containerImageURL,
          resources: {
            requests: {
              cpu: this.cpu,
              memoryInGB: this.memory
            }
          },
          command: [
            '/artillery/loadgen-worker',
            '-z',
            'yes', // yes for Azure
            '-q',
            this.queueUrl,
            '-p',
            this.blobContainerName,
            '-a',
            util.btoa(JSON.stringify(this.artilleryArgs)),
            '-i',
            this.testRunId,
            '-t',
            String(WAIT_TIMEOUT),
            '-d',
            'NOT_USED_ON_AZURE',
            '-r',
            'NOT_USED_ON_AZURE'
          ],
          environmentVariables
        }
      ],
      osType: 'Linux',
      restartPolicy: 'Never'
    };

    if (!this.ts) {
      this.ts = Date.now();
    }

    const containerGroupName = `artillery-test-${this.ts}-${this.testRunId}-${this.count}`;
    try {
      const containerInstance =
        await client.containerGroups.beginCreateOrUpdate(
          this.resourceGroupName,
          containerGroupName,
          containerGroup
        );

      this.containerInstances.push(containerInstance);

      this.count++;
    } catch (err) {
      // TODO: Make this better
      console.log(err.code);
      console.log(err.details?.error?.message);
      throw err;
    }
  }

  async stopWorker(_workerId) {}

  async checkLicense() {
    const baseUrl =
      process.env.ARTILLERY_CLOUD_ENDPOINT || 'https://app.artillery.io';
    const res = await request.get(`${baseUrl}/api/user/whoami`, {
      headers: {
        'x-auth-token': this.cloudKey
      },
      throwHttpErrors: false,
      retry: {
        limit: 3
      }
    });

    try {
      const body = JSON.parse(res.body);
      const activeOrg = body.activeOrg;
      if (!activeOrg) {
        return false;
      }
      if (!Array.isArray(body.memberships)) {
        return false;
      }

      const activeMembership = body.memberships.find(
        (membership) => membership.id === activeOrg
      );

      if (!activeMembership) {
        return false;
      }

      const plan = activeMembership.plan;
      return plan === 'business' || plan === 'enterprise';
    } catch (err) {
      return false;
    }
  }
}

module.exports = PlatformAzureACI;
