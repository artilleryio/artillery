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
    ' __________\n' +
    '< minigun! >\n' +
    ' ----------\n'
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
