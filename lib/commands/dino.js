/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

module.exports = dino;

module.exports.getConfig = function(callback) {
  let commandConfig = {
    name: 'dino',
    command: 'dino',
    description: 'Show dinosaur of the day',
    options: [
      ['-q, --quiet', 'Do not print anything to stdout']
    ]
  };

  if (callback) {
    return callback(null, commandConfig);
  } else {
    return commandConfig;
  }
};

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
  const balloon = !options.quiet ?
    ' ____________\n' +
    '< artillery! >\n' +
    ' ------------\n'
  :
    ' _______________________\n' +
    '< You can\'t silence me! >\n' +
    ' -----------------------\n';

  console.log(balloon +
'          \\\n' +
'           \\');
  let today = new Date();
  let year = today.getFullYear();
  let month = today.getMonth() + 1;
  let day = today.getDate();
  let i = year * month * day % dinos.length;
  console.log(dinos[i]);
}
