'use strict';

var { test } = require('tap');
var runner = require('../../../lib/runner').runner;
var tls = require('tls');
var fs = require('fs');
var path = require('path');

var options = {
  key: fs.readFileSync(
    path.resolve(__dirname, '../targets/certs/private-key.pem')
  ),
  cert: fs.readFileSync(
    path.resolve(__dirname, '../targets/certs/public-cert.pem')
  ),
  path: '/'
};

var server = tls.createServer(options, function (socket) {
  socket.pipe(socket);
});
server.listen(3002);

test('tls strict', function (t) {
  var script = require('../scripts/tls-strict.json');
  runner(script).then(function (ee) {
    ee.on('done', function (report) {
      var rejected = report.errors.DEPTH_ZERO_SELF_SIGNED_CERT;
      t.ok(rejected, 'requests to self-signed tls certs fail by default');

      t.end();
    });
    ee.run();
  });
});

test('tls lax', function (t) {
  var script = require('../scripts/tls-lax.json');
  runner(script).then(function (ee) {
    ee.on('done', function (report) {
      var rejected = report.errors.DEPTH_ZERO_SELF_SIGNED_CERT;
      var reason =
        'requests to self-signed tls certs pass ' +
        'when `rejectUnauthorized` is false';

      t.ok(rejected == null, reason);

      t.end();
      server.close();
    });
    ee.run();
  });
});
