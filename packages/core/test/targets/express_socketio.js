const cookieParser = require('cookie-parser');
const { createServer } = require('http');
const app = require('express')();
const socketio = require('socket.io');
const uuid = require('uuid');
const { once } = require('events');

const createTestServer = async (port) => {
  app.get('/test-get', handler);
  app.post('/test-post', handler);
  app.put('/test-put', handler);
  app.delete('/test-delete', handler);
  app.post('/setscookie', setsCookie);
  app.get('/expectscookie', cookieParser(), expectsCookie);
  app.get('/_stats', stats);

  const http = createServer(app);
  const io = socketio(http);
  const COOKIES = {};
  let MESSAGE_COUNT = 0;
  let CONNECTION_COUNT = 0;

  io.on('connection', function connection(ws) {
    CONNECTION_COUNT++;
    console.log('+ Express connection');
    ws.on('echo', function incoming(message) {
      MESSAGE_COUNT++;
      console.log('Express echoing message: %s', message);
      ws.emit('echoed', message);
    });
  });

  function handler(req, res) {
    console.log('Express send HTTP OK');
    res.writeHead(200);
    res.end(JSON.stringify({ key: 'value' }));
  }

  function setsCookie(req, res) {
    const newuid = uuid.v4();
    console.log('setting testCookie.uid to %j', newuid);
    res.cookie('testCookie', { uid: newuid }).send('ok');
  }

  function expectsCookie(req, res) {
    console.log('req.cookies = %j', req.cookies);
    console.log('req.cookies.testCookie = %j', req.cookies.testCookie);
    const cookie = req.cookies.testCookie;
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

  http.listen(port || 0);
  await once(http, 'listening');
  console.log('Express Socket.io listening on %s', http.address().port);

  return http;
};

module.exports = createTestServer;
