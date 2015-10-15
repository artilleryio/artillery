'use strict';

var _ = require('lodash');

module.exports = dino;

var dinos = [

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
  var balloon = !options.quiet ?
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
  var i = _.random(0, dinos.length - 1);
  console.log(dinos[i]);
}
