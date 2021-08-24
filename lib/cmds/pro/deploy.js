const { Command, flags } = require('@oclif/command');

const telemetry = require('../../telemetry').init();

const Pro = require('artillery-pro');

class RunCommand extends Command {
  static aliases = ['deploy'];

  async run() {
    const { flags, argv, args } = this.parse(RunCommand);
    telemetry.capture('pro:deploy');
    Pro.commands.setup(flags);
  }
}

RunCommand.description = Pro.oclif.deploy.description;
RunCommand.flags = Pro.oclif.deploy.flags;
RunCommand.args = Pro.oclif.deploy.args;

module.exports = RunCommand;
