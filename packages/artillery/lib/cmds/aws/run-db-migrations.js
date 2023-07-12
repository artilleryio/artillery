const { Command, Flags } = require('@oclif/core');

var tryRequire = require('try-require');
const Pro = tryRequire('artillery-pro');

class RunDbMigrations extends Command {
  static aliases = ['admin:run-db-migrations'];
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
    const { flags, argv, args } = await this.parse(RunDbMigrations);
    Pro.commands.runDbMigrations(flags);
  }
}

if (Pro) {
  RunDbMigrations.description = Pro.oclif.runDbMigrations.description;
  RunDbMigrations.flags = Pro.oclif.runDbMigrations.flags;
  RunDbMigrations.args = Pro.oclif.runDbMigrations.args;
} else {
  RunDbMigrations.description = 'this command requires artillery-pro';
}

module.exports = RunDbMigrations;
