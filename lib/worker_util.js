'use strict';

var debug = require('debug')('worker_common');
var gaussian = require('gaussian');

module.exports = {
  createThink: createThink
};

var DISTRIBUTIONS = {};

function createThink(requestSpec) {
  var t = requestSpec.think;

  var distribution;

  if(DISTRIBUTIONS[t]) {
    distribution = DISTRIBUTIONS[t];
  } else {
    distribution = gaussian(t, t * 0.2);
    DISTRIBUTIONS[t] = distribution;
  }

  var thinktime = Math.round(distribution.ppf(Math.random()) * 1000);

  var f = function(context, callback) {
    debug('think %s', requestSpec.think);
    setTimeout(function() {
      callback(null, context);
    }, thinktime);
  };

  return f;
}
