const { Command, flags } = require('@oclif/command');

const telemetry = require('../../telemetry').init();

const Pro = require('artillery-pro');

class RunCommand extends Command {
  static aliases = ['subscription'];

  async run() {
    const { flags, argv, args } = this.parse(RunCommand);
    telemetry.capture('pro:subscription');
    Pro.commands.subscriptionStatus(flags);
  }
}

RunCommand.description = Pro.oclif.subscription.description;
RunCommand.flags = Pro.oclif.subscription.flags;
RunCommand.args = Pro.oclif.subscription.args;

module.exports = RunCommand;
