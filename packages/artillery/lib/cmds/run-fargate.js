/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { Command, Flags, Args } = require('@oclif/core');
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

    flags['platform-opt'] = [`region=${flags.region}`];

    flags.platform = 'aws:ecs';

    new CloudPlugin(null, null, { flags });

    const ECS = new PlatformECS(null, null, {}, { testRunId: 'foo' });
    await ECS.init();

    flags.taskRoleName = ECS_WORKER_ROLE_NAME;
    process.env.USE_NOOP_BACKEND_STORE = 'true';

    flags.region = flags.region || 'us-east-1';

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
  count: Flags.integer({
    description: runTestDescriptions.count
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
  target: Flags.string({
    char: 't',
    description:
      'Set target endpoint. Overrides the target already set in the test script'
  }),
  cpu: Flags.string({
    description:
      'Set task vCPU on Fargate. May be set as number of vCPUs, e.g. 4, or as vCPU units, e.g. 4096',
    default: '4'
  }),
  memory: Flags.string({
    description:
      'Set task memory on Fargate. May be set in GB, e.g. 8gb, or as number of MiB, e.g. 8192',
    default: '8gb'
  }),
  output: Flags.string({
    char: 'o',
    description: 'Write a JSON report to file'
  }),
  insecure: Flags.boolean({
    char: 'k',
    description: 'Allow insecure TLS connections; do not use in production'
  }),
  environment: Flags.string({
    char: 'e',
    description: 'Use one of the environments specified in config.environments'
  }),
  config: Flags.string({
    description: 'Read configuration for the test from the specified file'
  }),
  'scenario-name': Flags.string({
    description: 'Name of the specific scenario to run'
  }),
  overrides: Flags.string({
    description: 'Dynamically override values in the test script; a JSON object'
  }),
  input: Flags.string({
    char: 'i',
    description: 'Input script file',
    multiple: true,
    hidden: true
  }),
  tags: Flags.string({
    description:
      'Comma-separated list of tags in key:value format to tag the test run, for example: --tags team:sre,service:foo'
  }),
  note: Flags.string({}), // TODO: description
  packages: Flags.string({
    description: runTestDescriptions.packages
  }),
  'max-duration': Flags.string({
    description: runTestDescriptions.maxDuration
  }),
  dotenv: Flags.string({
    description: runTestDescriptions.dotenv
  }),
  record: Flags.boolean({
    description: 'Record test run to Artillery Cloud'
  }),
  key: Flags.string({
    description: 'API key for Artillery Cloud'
  })
};

RunCommand.args = {
  script: Args.string()
};

module.exports = RunCommand;
