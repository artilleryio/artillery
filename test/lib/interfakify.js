'use strict';

var Interfake = require('interfake');
var l = require('lodash');

module.exports = {
  create: create
};

function create(requests, config) {
  var interfakeOpts = {};
  if (process.env.DEBUG && process.env.DEBUG.match(/interfake/)) {
    interfakeOpts.debug = true;
  }

  var responses = {
    'get': 200,
    'post': 201,
    'put': 204,
    'delete': 200
  };

  var target = new Interfake(interfakeOpts);
  l.each(requests, function(requestSpec) {
    var verb = l.keys(requestSpec)[0];
    if(responses[verb]) { // skip thinks etc that's not a HTTP verb
      var params = requestSpec[verb];
      target[verb].call(target, params.url).status(responses[verb]);
    }
  });

  return target;
}
