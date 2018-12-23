/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const chalk = require('chalk');

module.exports = dino;

module.exports.getConfig = function(callback) {
  let commandConfig = {
    name: 'dino',
    command: 'dino',
    description: 'Show dinosaur of the day',
    options: [
      ['-q, --quiet', 'Do not print anything to stdout'],
      ['-r, --rainbow', 'Make the dino proud'],
      ['-m, --message <text>', 'Display a custom message']
    ]
  };

  if (callback) {
    return callback(null, commandConfig);
  } else {
    return commandConfig;
  }
};

function rainbow(str) {
  const letters = str.split('');
  const colors = ['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'];
  const colorsCount = colors.length;

  return letters.map((l, i) => {
    const color = colors[i % colorsCount];
    return chalk[color](l);
  }).join('');
}

const dinos = [

'               __' + '\n' +
'              / _)' + '\n' +
'     _/\\/\\/\\_/ /' + '\n' +
'   _|         /' + '\n' +
' _|  (  | (  |' + '\n' +
'/__.-\'|_|--|_|' + '\n',

'            __ \n' +
'           / _) \n' +
'    .-^^^-/ / \n' +
' __/       / \n' +
'<__.|_|-|_|',

'                         .@\n' +
'                        @.+\n' +
'                       @,\n' +
'                      @\'\n' +
'                     @\'\n' +
'                    @;\n' +
'                  `@;\n' +
'                 @+;\n' +
'              .@#;\'\n' +
'         #@###@;\'.\n' +
'       :#@@@@@;.\n' +
'      @@@+;\'@@:\n' +
'    `@@@\';;;@@\n' +
'   @;:@@;;;;+#\n' +
'`@;`  ,@@,, @@`\n' +
'      @`@   @`+\n' +
'      @ ,   @ @\n' +
'      @ @   @ @',

'            ..`\n' +
'            ;:,\'+;\n' +
'            ,;;,,;,\n' +
'              #:;\':\n' +
'              @\';\'+;\n' +
'            `::;\'\'\';\n' +
'            \'; ,:\'+;;\n' +
'  `,,`      .;\';\'+;\'\n' +
' ;   `\'+;;;::\';++\':,;\n' +
'        `+++++##+\'\';#\n' +
'           .;+##+\'\'\';\n' +
'            \'+##\'\'\'#\'\n' +
'           ++# +;\'.##\n' +
'           ##, `: .#,\n' +
'          :#      \'+\n' +
'          #.      \'\n' +
'          #       +\n' +
'         :+       #\'\n' +
'         #+`       \';.'
];

function dino(options) {
  let output = '';
  const message = options.message ? options.message : (options.quiet ? 'You can\'t silence me!' : 'Artillery!');
  const n = message.length + 2;
  const balloon = ` ${'-'.repeat(n)}\n< ${ message } >\n ${'-'.repeat(n)}\n`;

  output += balloon +
    '          \\\n' +
    '           \\\n';

  let i = Math.floor(Math.random() * dinos.length);
  output += dinos[i];

  if (options.rainbow) {
    console.log(rainbow(output));
  } else {
    console.log(output);
  }
}
