/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { Command, Flags } = require('@oclif/core');
const { rainbow } = require('../util');

class DinoCommand extends Command {
  async run() {
    const { flags } = await this.parse(DinoCommand);
    let output = '';
    const message = flags.message
      ? flags.message
      : flags.quiet
      ? "You can't silence me!"
      : 'Artillery!';
    const n = message.length + 2;
    const balloon = ` ${'-'.repeat(n)}\n< ${message} >\n ${'-'.repeat(n)}\n`;

    output += balloon + '          \\\n' + '           \\\n';

    let i = Math.floor(Math.random() * dinos.length);
    output += dinos[i];

    if (flags.rainbow) {
      console.log(rainbow(output));
    } else {
      console.log(output);
    }
  }
}

DinoCommand.description = 'here be dinosaurs';
DinoCommand.flags = {
  message: Flags.string({
    char: 'm',
    description: 'Tell dinosaur what to say'
  }),
  rainbow: Flags.boolean({
    char: 'r',
    description: 'Add some color'
  }),
  quiet: Flags.boolean({
    char: 'q',
    description: 'Quiet mode'
  })
};

const dinos = [
  '               __' +
    '\n' +
    '              / _)' +
    '\n' +
    '     _/\\/\\/\\_/ /' +
    '\n' +
    '   _|         /' +
    '\n' +
    ' _|  (  | (  |' +
    '\n' +
    "/__.-'|_|--|_|" +
    '\n',

  '            __ \n' +
    '           / _) \n' +
    '    .-^^^-/ / \n' +
    ' __/       / \n' +
    '<__.|_|-|_|',

  '                         .@\n' +
    '                        @.+\n' +
    '                       @,\n' +
    "                      @'\n" +
    "                     @'\n" +
    '                    @;\n' +
    '                  `@;\n' +
    '                 @+;\n' +
    "              .@#;'\n" +
    "         #@###@;'.\n" +
    '       :#@@@@@;.\n' +
    "      @@@+;'@@:\n" +
    "    `@@@';;;@@\n" +
    '   @;:@@;;;;+#\n' +
    '`@;`  ,@@,, @@`\n' +
    '      @`@   @`+\n' +
    '      @ ,   @ @\n' +
    '      @ @   @ @',

  '            ..`\n' +
    "            ;:,'+;\n" +
    '            ,;;,,;,\n' +
    "              #:;':\n" +
    "              @';'+;\n" +
    "            `::;''';\n" +
    "            '; ,:'+;;\n" +
    "  `,,`      .;';'+;'\n" +
    " ;   `'+;;;::';++':,;\n" +
    "        `+++++##+'';#\n" +
    "           .;+##+''';\n" +
    "            '+##'''#'\n" +
    "           ++# +;'.##\n" +
    '           ##, `: .#,\n' +
    "          :#      '+\n" +
    "          #.      '\n" +
    '          #       +\n' +
    "         :+       #'\n" +
    "         #+`       ';."
];

module.exports = DinoCommand;
