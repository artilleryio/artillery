const fs = require('node:fs');
const path = require('node:path');

const https = require('node:https');
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
    (_req, res) => {
      res.writeHead(200);
      res.end();
    }
  );

  const wss = new WebSocketServer({ server: app });

  wss.on('connection', (client) => {
    debug('+ client');
    client.on('message', (message) => {
      debug(message);
    });
  });

  return new Promise((resolve, _reject) => {
    app.listen(0, () => {
      resolve({ server: app, wss, port: app.address().port });
    });
  });
};

module.exports = createTestServer;
