'use strict';

var _ = require('lodash');
var colors = require('colors');

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

function dino() {
  console.log((
' __________\n' +
'< minigun! >\n' +
' ----------\n' +
'          \\\n' +
'           \\').rainbow);
  var i = _.random(0, dinos.length - 1);
  console.log(dinos[i].rainbow);
}
