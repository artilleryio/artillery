const { Command, Flags } = require('@oclif/core');

const telemetry = require('../../telemetry').init();

var tryRequire = require('try-require');
const Pro = tryRequire('artillery-pro');

class ListTestBundlesCommand extends Command {
  static aliases = ['list-test-bundles'];
  static hidden = true;
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

    const { flags, argv, args } = await this.parse(ListTestBundlesCommand);
    Pro.commands.listTests(flags);
  }
}

if (Pro) {
  ListTestBundlesCommand.description = Pro.oclif.listTestBundles.description;
  ListTestBundlesCommand.flags = Pro.oclif.listTestBundles.flags;
  ListTestBundlesCommand.args = Pro.oclif.listTestBundles.args;
} else {
  ListTestBundlesCommand.description = 'this command requires artillery-pro';
}

module.exports = ListTestBundlesCommand;
