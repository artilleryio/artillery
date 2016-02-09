/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const _ = require('lodash');

module.exports = dino;

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
'<__.|_|-|_|'

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
  let i = _.random(0, dinos.length - 1);
  console.log(dinos[i]);
}
