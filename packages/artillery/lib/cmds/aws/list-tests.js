const { Command, flags } = require('@oclif/command');

var tryRequire = require('try-require');
const Pro = tryRequire('artillery-pro');

class ListTestsCommand extends Command {
  static aliases = ['list-tests'];
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

    const { flags, argv, args } = this.parse(ListTestsCommand);
    Pro.commands.getTests(flags);
  }
}

if (Pro) {
  ListTestsCommand.description = Pro.oclif.listTests.description;
  ListTestsCommand.flags = Pro.oclif.listTests.flags;
  ListTestsCommand.args = Pro.oclif.listTests.args;
} else {
  ListTestsCommand.description = 'this command requires artillery-pro';
}

module.exports = ListTestsCommand;
