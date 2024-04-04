'use strict';

const fs = require('fs');
const path = require('path');

const https = require('https');
const debug = require('debug')('test:target:ws_tls');
const WebSocketServer = require('ws').Server;

const createTestServer = (port = 9443) => {
  const options = {
    port,
    key: fs.readFileSync(path.resolve(__dirname, './certs/private-key.pem')),
    cert: fs.readFileSync(path.resolve(__dirname, './certs/public-cert.pem'))
  };
  const app = https.createServer(
    {
      key: options.key,
      cert: options.cert
    },
    function (req, res) {
      res.writeHead(200);
      res.end();
    }
  );

  const wss = new WebSocketServer({ server: app });

  wss.on('connection', function (client) {
    debug('+ client');
    client.on('message', function (message) {
      debug(message);
    });
  });

  return app;
};

module.exports = createTestServer;
