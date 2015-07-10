'use strict';

var debug = require('debug')('worker_util');

module.exports = {
  createThink: createThink
};

function createThink(requestSpec) {
  var thinktime = requestSpec.think * 1000;

  var f = function(context, callback) {
    debug('think %s -> %s', requestSpec.think, thinktime);
    setTimeout(function() {
      callback(null, context);
    }, thinktime);
  };

  return f;
}
