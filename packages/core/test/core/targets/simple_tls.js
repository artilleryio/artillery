const https = require('https');
const fs = require('fs');
const path = require('path');

const createTestServer = () => {
  const options = {
    key: fs.readFileSync(path.resolve(__dirname, '../certs/private-key.pem')),
    cert: fs.readFileSync(path.resolve(__dirname, '../certs/public-cert.pem')),
    path: '/'
  };

  const server = https.createServer(options, function (req, res) {
    console.log('+');
    res.writeHead(200);
    res.end('hello\n');
  });

  return server;
};

if (require.main === module) {
  const PORT = 3002;
  createTestServer().listen(PORT, function () {
    console.log('simple_tls running on %s', PORT);
  });
}

module.exports = createTestServer;
