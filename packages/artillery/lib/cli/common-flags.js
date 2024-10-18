const { Flags } = require('@oclif/core');

const CommonRunFlags = {
  target: Flags.string({
    char: 't',
    description:
      'Set target endpoint. Overrides the target already set in the test script'
  }),
  config: Flags.string({
    char: 'c',
    description: 'Read configuration for the test from the specified file'
  }),
  // TODO: Replace with --profile
  environment: Flags.string({
    char: 'e',
    description: 'Use one of the environments specified in config.environments'
  }),
  'scenario-name': Flags.string({
    description: 'Name of the specific scenario to run'
  }),
  output: Flags.string({
    char: 'o',
    description: 'Write a JSON report to file'
  }),
  dotenv: Flags.string({
    description: 'Path to a dotenv file to load environment variables from',
    aliases: ['env-file']
  }),
  variables: Flags.string({
    char: 'v',
    description:
      'Set variables available to vusers during the test; a JSON object'
  }),
  overrides: Flags.string({
    description: 'Dynamically override values in the test script; a JSON object'
  }),
  insecure: Flags.boolean({
    char: 'k',
    description: 'Allow insecure TLS connections; do not use in production'
  }),
  quiet: Flags.boolean({
    char: 'q',
    description: 'Quiet mode'
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

  //Artillery Cloud options:

  name: Flags.string({
    description:
      'Name of the test run. This name will be shown in the Artillery Cloud dashboard. Equivalent to setting a "name" tag.'
  }),
  tags: Flags.string({
    description:
      'Comma-separated list of tags in key:value format to tag the test run with in Artillery Cloud, for example: --tags team:sqa,service:foo'
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

module.exports = {
  CommonRunFlags
};
