const { Command, Flags, Args } = require('@oclif/core');
const { CommonRunFlags } = require('../cli/common-flags');

const RunCommand = require('./run');

class RunLambdaCommand extends Command {
  static aliases = ['run:lambda'];
  static strict = false;

  async run() {
    const { flags, argv, args } = await this.parse(RunLambdaCommand);

    flags['platform-opt'] = [
      `region=${flags.region}`,
      `memory-size=${flags['memory-size']}`,
      `architecture=${flags.architecture}`
    ];

    delete flags.region;
    delete flags['memory-size'];
    delete flags.architecture;

    if (flags['lambda-role-arn']) {
      flags['platform-opt'].push(`lambda-role-arn=${flags['lambda-role-arn']}`);
    }

    if (flags['security-group-ids']) {
      flags['platform-opt'].push(
        `security-group-ids=${flags['security-group-ids']}`
      );
    }

    if (flags['subnet-ids']) {
      flags['platform-opt'].push(`subnet-ids=${flags['subnet-ids']}`);
    }

    flags.platform = 'aws:lambda';

    RunCommand.runCommandImplementation(flags, argv, args);
  }
}

RunLambdaCommand.description = `launch a test using AWS Lambda
Launch a test on AWS Lambda

Examples:

  To run a test script in my-test.yml on AWS Lambda in us-east-1 region
  distributed across 10 Lambda functions:

    $ artillery run:lambda --region us-east-1 --count 10 my-test.yml
`;
RunLambdaCommand.flags = {
  ...CommonRunFlags,
  payload: Flags.string({
    char: 'p',
    description: 'Specify a CSV file for dynamic data'
  }),
  count: Flags.string({
    // locally defaults to number of CPUs with mode = distribute
    default: '1'
  }),
  architecture: Flags.string({
    description: 'Architecture of the Lambda function',
    default: 'arm64',
    options: ['arm64', 'x86_64']
  }),
  'memory-size': Flags.string({
    description: 'Memory size of the Lambda function',
    default: '4096'
  }),
  region: Flags.string({
    description: 'AWS region to run the test in',
    default: 'us-east-1'
  }),
  'lambda-role-arn': Flags.string({
    description: 'ARN of the IAM role to use for the Lambda function'
  }),
  'security-group-ids': Flags.string({
    description:
      'Comma-separated list of security group IDs to use for the Lambda function'
  }),
  'subnet-ids': Flags.string({
    description:
      'Comma-separated list of subnet IDs to use for the Lambda function'
  })
};

RunLambdaCommand.args = {
  script: Args.string({
    name: 'script',
    required: true
  })
};

module.exports = RunLambdaCommand;
