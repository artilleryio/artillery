const { Command, flags } = require('@oclif/command');

const telemetry = require('../../telemetry').init();

var tryRequire = require('try-require');
const Pro = tryRequire('artillery-pro');

class DeleteTestBundleCommand extends Command {
  static aliases = ['delete-test-bundle'];

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

    const { flags, argv, args } = this.parse(DeleteTestBundleCommand);
    Pro.commands.deleteTest(args.name);
  }
}

if (Pro) {
  DeleteTestBundleCommand.description = Pro.oclif.deleteTestBundle.description;
  DeleteTestBundleCommand.flags = Pro.oclif.deleteTestBundle.flags;
  DeleteTestBundleCommand.args = Pro.oclif.deleteTestBundle.args;
} else {
  DeleteTestBundleCommand.description = 'this command requires artillery-pro';
}

module.exports = DeleteTestBundleCommand;
