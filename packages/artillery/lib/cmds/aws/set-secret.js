const { Command, Flags } = require('@oclif/core');

const telemetry = require('../../telemetry').init();

var tryRequire = require('try-require');
const Pro = tryRequire('artillery-pro');

class SetSecretCommand extends Command {
  static aliases = ['set-secret'];
  static hidden = true;
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

    const { flags, argv, args } = await this.parse(SetSecretCommand);
    Pro.commands.secretSet(flags);
  }
}

if (Pro) {
  SetSecretCommand.description = Pro.oclif.setSecret.description;
  SetSecretCommand.flags = Pro.oclif.setSecret.flags;
  SetSecretCommand.args = Pro.oclif.setSecret.args;
} else {
  SetSecretCommand.description = 'this command requires artillery-pro';
}

module.exports = SetSecretCommand;
