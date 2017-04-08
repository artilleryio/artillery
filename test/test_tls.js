'use strict';

var test = require('tape');
var runner = require('../lib/runner').runner;
var tls = require('tls');
var fs = require('fs');

var options = {
  key: fs.readFileSync('./test/certs/private-key.pem'),
  cert: fs.readFileSync('./test/certs/public-cert.pem'),
  path: '/'
};

var server = tls.createServer(options, function(socket) {
  socket.pipe(socket);
});
server.listen(3002);

test('tls strict', function(t) {
  var script = require('./scripts/tls-strict.json');
  runner(script).then(function(ee) {
    ee.on('done', function(report) {
      var rejected = report.errors.DEPTH_ZERO_SELF_SIGNED_CERT;
      t.assert(rejected, 'requests to self-signed tls certs fail by default');

      t.end();
    });
    ee.run();
  });
});

test('tls lax', function(t) {
  var script = require('./scripts/tls-lax.json');
  runner(script).then(function(ee) {
    ee.on('done', function(report) {
      var rejected = report.errors.DEPTH_ZERO_SELF_SIGNED_CERT;
      var reason = 'requests to self-signed tls certs pass ' +
          'when `rejectUnauthorized` is false';

      t.assert(rejected == null, reason);

      t.end();
      server.close();
    });
    ee.run();
  });
});
