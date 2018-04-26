var https = require('https');
var fs = require('fs');

var options = {
  key: fs.readFileSync('./test/certs/private-key.pem'),
  cert: fs.readFileSync('./test/certs/public-cert.pem'),
  path: '/'
};

var server = https.createServer(options, function(req, res) {
  console.log('+');
  res.writeHead(200);
  res.end('hello\n');
});
server.listen(3002, function() {
  console.log('simple_tls server running on 3002');
});
