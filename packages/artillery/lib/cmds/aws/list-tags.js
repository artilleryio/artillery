const { Command, flags } = require('@oclif/command');

var tryRequire = require('try-require');
const Pro = tryRequire('artillery-pro');

class ListTagsCommand extends Command {
  static aliases = ['list-tags'];
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

    Pro.commands.listTags();
  }
}

if (Pro) {
  ListTagsCommand.description = Pro.oclif.listTags.description;
  ListTagsCommand.flags = Pro.oclif.listTags.flags;
  ListTagsCommand.args = Pro.oclif.listTags.args;
} else {
  ListTagsCommand.description = 'this command requires artillery-pro';
}

module.exports = ListTagsCommand;
