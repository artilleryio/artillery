/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { Command, Flags, Args } = require('@oclif/core');
const { CommonRunFlags } = require('../cli/common-flags');
const telemetry = require('../telemetry').init();
const { Plugin: CloudPlugin } = require('../platform/cloud/cloud');

const runCluster = require('../platform/aws-ecs/legacy/run-cluster');
const PlatformECS = require('../platform/aws-ecs/ecs');
const { ECS_WORKER_ROLE_NAME } = require('../platform/aws/constants');

class RunCommand extends Command {
  static aliases = ['run:fargate'];
  // Enable multiple args:
  static strict = false;

  async run() {
    const { flags, _argv, args } = await this.parse(RunCommand);
    flags.region = flags.region || 'us-east-1';

    flags['platform-opt'] = [`region=${flags.region}`];

    flags.platform = 'aws:ecs';

    new CloudPlugin(null, null, { flags });

    const ECS = new PlatformECS(
      null,
      null,
      {},
      { testRunId: 'foo', region: flags.region }
    );
    await ECS.init();

    flags.taskRoleName = ECS_WORKER_ROLE_NAME;
    process.env.USE_NOOP_BACKEND_STORE = 'true';

    telemetry.capture('run:fargate', {
      region: flags.region,
      count: flags.count
    });

    // Delegate the rest to existing implementation:
    runCluster(args.script, flags);
  }
}

const runTestDescriptions = {
  count: 'Number of load generator workers to launch',
  cluster: 'Name of the Fargate/ECS cluster to run the test on',
  region: 'The AWS region to run in',
  packages:
    'Path to package.json file which lists dependencies for the test script',
  maxDuration: 'Maximum duration of the test run',
  dotenv: 'Path to a .env file to load environment variables from'
};

RunCommand.description = `launch a test using AWS ECS/Fargate

Examples:

  To launch a test with 10 load generating workers using AWS Fargate in us-east-1:

    $ artillery run:fargate --count 10 --region us-east-1 my-test.yml
`;

RunCommand.flags = {
  ...CommonRunFlags,
  count: Flags.integer({
    description: runTestDescriptions.count
  }),
  variables: Flags.string({
    char: 'v',
    description:
      'Set variables available to vusers during the test; a JSON object'
  }),
  cluster: Flags.string({
    description: runTestDescriptions.cluster
  }),
  region: Flags.string({
    char: 'r',
    description: runTestDescriptions.region
  }),
  secret: Flags.string({
    multiple: true
  }),
  // TODO: Descriptions
  'launch-type': Flags.string({}),
  'launch-config': Flags.string({}),
  'subnet-ids': Flags.string({}),
  'security-group-ids': Flags.string({}),
  'task-role-name': Flags.string({}),
  cpu: Flags.string({
    description:
      'Set task vCPU on Fargate. Value may be set as a number of vCPUs between 1-16 (e.g. 4), or as number of vCPU units (e.g. 4096)',
    default: '4'
  }),
  memory: Flags.string({
    description:
      'Set task memory on Fargate. Value may be set as number of GB between 1-120 (e.g. 8), or as MiB (e.g. 8192)',
    default: '8'
  }),
  packages: Flags.string({
    description: runTestDescriptions.packages
  }),
  'max-duration': Flags.string({
    description: runTestDescriptions.maxDuration
  }),
  dotenv: Flags.string({
    description: runTestDescriptions.dotenv
  })
};

RunCommand.args = {
  script: Args.string()
};

module.exports = RunCommand;
