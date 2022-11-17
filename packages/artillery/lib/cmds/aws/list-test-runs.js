const { Command, flags } = require('@oclif/command');

var tryRequire = require('try-require');
const Pro = tryRequire('artillery-pro');

class ListTestRunsCommand extends Command {
  static aliases = ['list-test-runs'];
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

    const { flags, argv, args } = this.parse(ListTestRunsCommand);
    Pro.commands.listTestRuns(flags);
  }
}

if (Pro) {
  ListTestRunsCommand.description = Pro.oclif.listTestRuns.description;
  ListTestRunsCommand.flags = Pro.oclif.listTestRuns.flags;
  ListTestRunsCommand.args = Pro.oclif.listTestRuns.args;
} else {
  ListTestRunsCommand.description = 'this command requires artillery-pro';
}

module.exports = ListTestRunsCommand;
