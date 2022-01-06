const { Command, flags } = require('@oclif/command');

const telemetry = require('../../telemetry').init();

var tryRequire = require('try-require');
const Pro = tryRequire('artillery-pro');

class SetConfigValueCommand extends Command {
  static aliases = ['set-config-value'];

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

    const { flags, argv, args } = this.parse(SetConfigValueCommand);
    Pro.commands.configSet(flags);
  }
}

if (Pro) {
  SetConfigValueCommand.description = Pro.oclif.setConfigValue.description;
  SetConfigValueCommand.flags = Pro.oclif.setConfigValue.flags;
  SetConfigValueCommand.args = Pro.oclif.setConfigValue.args;
} else {
  SetConfigValueCommand.description = 'this command requires artillery-pro';
}

module.exports = SetConfigValueCommand;
