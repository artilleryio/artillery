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
  if (options.quiet) { return; }
  console.log(
' __________\n' +
'< minigun! >\n' +
' ----------\n' +
'          \\\n' +
'           \\');
  var i = _.random(0, dinos.length - 1);
  console.log(dinos[i]);
}
