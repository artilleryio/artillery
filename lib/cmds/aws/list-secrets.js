const { Command, flags } = require('@oclif/command');

const telemetry = require('../../telemetry').init();

var tryRequire = require('try-require');
const Pro = tryRequire('artillery-pro');

class ListSecretsCommand extends Command {
  static aliases = ['list-secrets'];

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

    const { flags, argv, args } = this.parse(ListSecretsCommand);
    Pro.commands.listSecrets(flags);
  }
}

if (Pro) {
  ListSecretsCommand.description = Pro.oclif.listSecrets.description;
  ListSecretsCommand.flags = Pro.oclif.listSecrets.flags;
  ListSecretsCommand.args = Pro.oclif.listSecrets.args;
} else {
  ListSecretsCommand.description = 'this command requires artillery-pro';
}

module.exports = ListSecretsCommand;
