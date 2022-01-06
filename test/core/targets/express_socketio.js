var app = require('express')();
app.get('/test-get', handler);
app.post('/test-post', handler);
app.put('/test-put', handler);
app.delete('/test-delete', handler);

var http = require('http').createServer(app);
var io = require('socket.io')(http);
var PORT = 9092;

http.listen(PORT, function () {
  console.log('Express Socket.io listening on %s', PORT);
});

var MESSAGE_COUNT = 0;
var CONNECTION_COUNT = 0;

io.on('connection', function connection(ws) {
  CONNECTION_COUNT++;
  console.log('+ Express connection');
  ws.on('echo', function incoming(message) {
    MESSAGE_COUNT++;
    console.log('Express echoing message: %s', message);
    ws.emit('echoed', message);
  });
});

// setInterval(function() {
//   console.log(new Date());
//   console.log('CONNECTION_COUNT [express] = %s', CONNECTION_COUNT);
//   console.log('MESSAGE_COUNT    [express] = %s', MESSAGE_COUNT);
// }, 5 * 1000);

function handler(req, res) {
  console.log('Express send HTTP OK');
  res.writeHead(200);
  res.end(JSON.stringify({ key: 'value' }));
}

var cookieParser = require('cookie-parser');
var uuid = require('uuid');

var COOKIES = {};

app.post('/setscookie', setsCookie);
app.get('/expectscookie', cookieParser(), expectsCookie);
app.get('/_stats', stats);

function setsCookie(req, res) {
  var newuid = uuid.v4();
  console.log('setting testCookie.uid to %j', newuid);
  res.cookie('testCookie', { uid: newuid }).send('ok');
}

function expectsCookie(req, res) {
  console.log('req.cookies = %j', req.cookies);
  console.log('req.cookies.testCookie = %j', req.cookies.testCookie);
  var cookie = req.cookies.testCookie;
  if (cookie) {
    if (COOKIES[cookie.uid]) {
      COOKIES[cookie.uid]++;
    } else {
      COOKIES[cookie.uid] = 1;
    }
    return res.send('ok');
  } else {
    return res.status(403).send();
  }
}

function stats(req, res) {
  return res.json({
    cookies: COOKIES
  });
}
