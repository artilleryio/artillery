'use strict';

const fs = require('fs');
const https = require('https');
const debug = require('debug')('test:target:ws_tls');
const WebSocketServer = require('ws').Server;

var options = {
  port: 9090,
  key: fs.readFileSync('./test/certs/private-key.pem'),
  cert: fs.readFileSync('./test/certs/public-cert.pem')
};

var app = https.createServer(
  {
    key: options.key,
    cert: options.cert
  },
  function(req, res) {
    res.writeHead(200);
    res.end();
  }).listen(options.port, function() {
    debug('Listening on :9090');
  });

const wss = new WebSocketServer({ server: app });

wss.on('connection', function(client) {
  debug('+ client');
  client.on('message', function(message) {
    debug(message);
  });
});
