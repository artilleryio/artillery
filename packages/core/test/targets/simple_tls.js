const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

const createTestServer = () => {
  const options = {
    key: fs.readFileSync(path.resolve(__dirname, './certs/private-key.pem')),
    cert: fs.readFileSync(path.resolve(__dirname, './certs/public-cert.pem')),
    path: '/'
  };

  const server = https.createServer(options, (_req, res) => {
    console.log('+');
    res.writeHead(200);
    res.end('hello\n');
  });

  return new Promise((resolve, _reject) => {
    server.listen(0, () => {
      resolve({ server, port: server.address().port });
    });
  });
};

module.exports = createTestServer;
