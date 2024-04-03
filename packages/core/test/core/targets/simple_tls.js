const https = require('https');
const fs = require('fs');
const path = require('path');

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
server.listen(3002, function () {
  console.log('simple_tls server running on 3002');
});
