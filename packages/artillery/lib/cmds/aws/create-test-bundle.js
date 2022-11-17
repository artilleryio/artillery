const { Command, flags } = require('@oclif/command');

const telemetry = require('../../telemetry').init();

var tryRequire = require('try-require');
const Pro = tryRequire('artillery-pro');

class CreateTestBundleCommand extends Command {
  static aliases = ['create-test-bundle'];

  async run() {
    if (!Pro) {
      console.error(
        'Error: This command requires artillery-pro to be installed\n'
      );
      console.error(
        'https://www.artillery.io/docs/guides/getting-started/installing-artillery-pro'
      );
      process.exit(1);
    }

    const { flags, argv, args } = this.parse(CreateTestBundleCommand);
    Pro.commands.createTest(args.script, flags);
  }
}

if (Pro) {
  CreateTestBundleCommand.description = Pro.oclif.createTestBundle.description;
  CreateTestBundleCommand.flags = Pro.oclif.createTestBundle.flags;
  CreateTestBundleCommand.args = Pro.oclif.createTestBundle.args;
} else {
  CreateTestBundleCommand.description = 'this command requires artillery-pro';
}

module.exports = CreateTestBundleCommand;
