/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { Command, Flags, Args } = require('@oclif/core');
const { CommonRunFlags } = require('../cli/common-flags');
const telemetry = require('../telemetry').init();

const runCluster = require('../platform/aws-ecs/legacy/run-cluster');
const { supportedRegions } = require('../platform/aws-ecs/legacy/util');
const PlatformECS = require('../platform/aws-ecs/ecs');
const { ECS_WORKER_ROLE_NAME } = require('../platform/aws/constants');
const { Plugin: CloudPlugin } = require('../platform/cloud/cloud');
class RunCommand extends Command {
  static aliases = ['run:fargate'];
  // Enable multiple args:
  static strict = false;

  async run() {
    const { flags, _argv, args } = await this.parse(RunCommand);
    flags['platform-opt'] = [`region=${flags.region}`];

    flags.platform = 'aws:ecs';

    const cloud = new CloudPlugin(null, null, { flags });
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

          process.exit(7);
        } else if (err.name === 'APIKeyUnauthorized') {
          console.error(
            'Error: API key is not recognized or is not authorized to record tests'
          );

          process.exit(7);
        } else {
          console.error(
            'Error: something went wrong connecting to Artillery Cloud'
          );
          console.error('Check https://x.com/artilleryio for status updates');
        }
      }
    }

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

RunCommand.description = `launch a test using AWS ECS/Fargate

Examples:

  To launch a test with 10 load generating workers using AWS Fargate in us-east-1:

    $ artillery run:fargate --count 10 --region us-east-1 my-test.yml
`;

RunCommand.flags = {
  ...CommonRunFlags,
  count: Flags.integer({
    description: 'Number of load generator workers to launch'
  }),
  cluster: Flags.string({
    description: 'Name of the Fargate/ECS cluster to run the test on'
  }),
  region: Flags.string({
    char: 'r',
    description: 'The AWS region to run in',
    options: supportedRegions,
    default: 'us-east-1'
  }),
  secret: Flags.string({
    multiple: true,
    description:
      'Make secrets available to workers. The secret must exist in SSM parameter store for the given region, under /artilleryio/<SECRET_NAME>'
  }),
  'launch-type': Flags.string({
    description: 'The launch type to use for the test. Defaults to Fargate.',
    options: ['ecs:fargate', 'ecs:ec2']
  }),
  spot: Flags.boolean({
    description:
      'Use Fargate Spot (https://docs.art/fargate-spot) Ignored when --launch-type is set to ecs:ec2'
  }),
  'launch-config': Flags.string({
    description:
      'JSON to customize launch configuration of ECS/Fargate tasks (see https://www.artillery.io/docs/reference/cli/run-fargate#using---launch-config)'
  }),
  'subnet-ids': Flags.string({
    description:
      'Comma-separated list of AWS VPC subnet IDs to launch Fargate tasks in'
  }),
  'security-group-ids': Flags.string({
    description:
      'Comma-separated list of AWS VPC security group IDs to launch Fargate tasks in'
  }),
  'task-role-name': Flags.string({
    description: 'Custom IAM role name for Fargate containers to assume'
  }),
  cpu: Flags.string({
    description:
      'Set task vCPU on Fargate (defaults to 4 vCPU). Value may be set as a number of vCPUs between 1-16 (e.g. 4), or as number of vCPU units (e.g. 4096).'
  }),
  memory: Flags.string({
    description:
      'Set task memory on Fargate (defaults 8 GB). Value may be set as number of GB between 1-120 (e.g. 8), or as MiB (e.g. 8192)'
  }),
  packages: Flags.string({
    description:
      'Path to package.json file which lists dependencies for the test script'
  }),
  'max-duration': Flags.string({
    description: 'Maximum duration of the test run'
  })
};

RunCommand.args = {
  script: Args.string()
};

module.exports = RunCommand;
