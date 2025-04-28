// Copyright (c) Artillery Software Inc.
// SPDX-License-Identifier: BUSL-1.1
//
// Non-evaluation use of Artillery on Azure requires a commercial license

const { Command, Flags, Args } = require('@oclif/core');
const { CommonRunFlags } = require('../cli/common-flags');
const { DefaultAzureCredential } = require('@azure/identity');
const { BlobServiceClient } = require('@azure/storage-blob');

const RunCommand = require('./run');

class RunACICommand extends Command {
  static aliases = ['run:aci'];
  static strict = false;

  async run() {
    const { flags, argv, args } = await this.parse(RunACICommand);
    flags.platform = 'az:aci';

    flags['platform-opt'] = [
      `region=${flags.region}`,
      `count=${flags.count}`,
      `cpu=${flags.cpu}`,
      `memory=${flags.memory}`,
      `tenant-id=${flags['tenant-id']}`,
      `subscription-id=${flags['subscription-id']}`,
      `storage-account=${flags['storage-account']}`,
      `blob-container=${flags['blob-container']}`,
      `resource-group=${flags['resource-group']}`
    ];

    RunCommand.runCommandImplementation(flags, argv, args);
  }
}

RunACICommand.description = `launch a test using Azure ACI
Launch a test on Azure ACI

Examples:

  To run a test script in my-test.yml on Azure ACI in eastus region
  with 10 workers:

    $ artillery run:aci --region eastus --count 10 my-test.yml
`;
RunACICommand.flags = {
  ...CommonRunFlags,
  count: Flags.string({
    default: '1'
  }),
  region: Flags.string({
    description: 'Azure region to run the test in',
    default: 'eastus'
  }),
  cpu: Flags.string({
    description:
      'Number of CPU cores per worker (defaults to 4 CPUs). A number between 1-4.'
  }),
  memory: Flags.string({
    description:
      'Memory in GB per worker (defaults to 8 GB). A number between 1-16.'
  }),
  'tenant-id': Flags.string({
    description:
      'Azure tenant ID. May also be set via AZURE_TENANT_ID environment variable.'
  }),
  'subscription-id': Flags.string({
    description:
      'Azure subscription ID. May also be set via AZURE_SUBSCRIPTION_ID environment variable.'
  }),
  'storage-account': Flags.string({
    description:
      'Azure Blob Storage account name. May also be set via AZURE_STORAGE_ACCOUNT environment variable.'
  }),
  'blob-container': Flags.string({
    description:
      'Azure Blob Storage container name. May also be set via AZURE_STORAGE_BLOB_CONTAINER environment variable.'
  }),
  'resource-group': Flags.string({
    description:
      'Azure Resource Group name. May also be set via AZURE_RESOURCE_GROUP environment variable.'
  })
};

RunACICommand.args = {
  script: Args.string({
    name: 'script',
    required: true
  })
};

module.exports = RunACICommand;
