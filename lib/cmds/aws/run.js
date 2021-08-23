const { Command, flags } = require('@oclif/command');

const telemetry = require('../../telemetry').init();

const Pro = require('artillery-pro');

class RunCommand extends Command {
  static aliases = ['run-test', 'run-cluster'];
  // Enable multiple args:
  static strict = false;

  async run() {
    const { flags, argv, args } = this.parse(RunCommand);
    Pro.commands.runCluster(args.script, flags);
  }
}

RunCommand.description = Pro.oclif.runTest.description;
RunCommand.flags = Pro.oclif.runTest.flags;
RunCommand.args = Pro.oclif.runTest.args;

module.exports = RunCommand;
