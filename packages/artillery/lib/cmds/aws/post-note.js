const { Command, Flags } = require('@oclif/core');

var tryRequire = require('try-require');
const Pro = tryRequire('artillery-pro');

class PostNoteCommand extends Command {
  static aliases = ['post-note'];
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
    const { flags, argv, args } = await this.parse(PostNoteCommand);
    Pro.commands.postNote(flags);
  }
}

if (Pro) {
  PostNoteCommand.description = Pro.oclif.postNote.description;
  PostNoteCommand.flags = Pro.oclif.postNote.flags;
  PostNoteCommand.args = Pro.oclif.postNote.args;
} else {
  PostNoteCommand.description = 'this command requires artillery-pro';
}

module.exports = PostNoteCommand;
