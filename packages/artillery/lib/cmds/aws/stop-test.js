const { Command, Flags } = require('@oclif/core');

var tryRequire = require('try-require');
const Pro = tryRequire('artillery-pro');

class StopTestCommand extends Command {
  static aliases = ['stop-test'];
  static hidden = true;
  async run() {
    const { flags, argv, args } = await this.parse(StopTestCommand);
    Pro.commands.stopTest(args.id);
  }
}

if (Pro) {
  StopTestCommand.description = Pro.oclif.stopTest.description;
  StopTestCommand.flags = Pro.oclif.stopTest.flags;
  StopTestCommand.args = Pro.oclif.stopTest.args;
} else {
  StopTestCommand.description = 'this command requires artillery-pro';
}

module.exports = StopTestCommand;
