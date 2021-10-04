const { Command, flags } = require('@oclif/command');

const telemetry = require('../../telemetry').init();

var tryRequire = require('try-require');
const Pro = tryRequire('artillery-pro');

class RunCommand extends Command {
  static aliases = ['deploy'];

  async run() {
    const { flags, argv, args } = this.parse(RunCommand);
    telemetry.capture('pro:deploy');
    Pro.commands.setup(flags);
  }
}

if (Pro) {
  RunCommand.description = Pro.oclif.deploy.description;
  RunCommand.flags = Pro.oclif.deploy.flags;
  RunCommand.args = Pro.oclif.deploy.args;
} else {
  RunCommand.description = 'this command requires artillery-pro';
}

module.exports = RunCommand;
