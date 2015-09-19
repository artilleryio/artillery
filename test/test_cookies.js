'use strict';

var test = require('tape');
var runner = require('../lib/runner').runner;
var l = require('lodash');
var request = require('request');

test('think', function(t) {
  var script = require('./scripts/cookies.json');
  var ee = runner(script);
  ee.on('done', function(stats) {
    request({
      method: 'GET',
      url: 'http://127.0.0.1:3003/_stats',
      json: true
    },
    function(err, res, body) {
      if (err) {
        return t.fail();
      }

      var ok = l.size(body.cookies) >= stats.aggregate.scenariosCompleted;
      t.assert(ok, 'Each scenario had a unique cookie');
      if (!ok) {
        console.log(body);
        console.log(stats);
      }
      t.end();
    });
  });
  ee.run();
});
