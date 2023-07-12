const { Command, Flags } = require('@oclif/core');

var tryRequire = require('try-require');
const Pro = tryRequire('artillery-pro');

class DeleteTestRunCommand extends Command {
  static aliases = ['delete-test-run'];
  static hidden = true;
  async run() {
    const { flags, argv, args } = await this.parse(DeleteTestRunCommand);
    Pro.commands.deleteTestRun(args.id);
  }
}

if (Pro) {
  DeleteTestRunCommand.description = Pro.oclif.deleteTestRun.description;
  DeleteTestRunCommand.flags = Pro.oclif.deleteTestRun.flags;
  DeleteTestRunCommand.args = Pro.oclif.deleteTestRun.args;
} else {
  DeleteTestRunCommand.description = 'this command requires artillery-pro';
}

module.exports = DeleteTestRunCommand;
