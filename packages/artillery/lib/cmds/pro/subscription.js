const { Command, Flags } = require('@oclif/core');

const telemetry = require('../../telemetry').init();

var tryRequire = require('try-require');
const Pro = tryRequire('artillery-pro');

class RunCommand extends Command {
  static aliases = ['subscription'];
  static hidden = true;
  async run() {
    const { flags, argv, args } = await this.parse(RunCommand);
    telemetry.capture('pro:subscription');
    Pro.commands.subscriptionStatus(flags);
  }
}

if (Pro) {
  RunCommand.description = Pro.oclif.subscription.description;
  RunCommand.flags = Pro.oclif.subscription.flags;
  RunCommand.args = Pro.oclif.subscription.args;
} else {
  RunCommand.description = 'this command requires artillery-pro';
}

module.exports = RunCommand;
