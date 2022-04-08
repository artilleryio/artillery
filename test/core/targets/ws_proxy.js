const WebSocketServer = require('ws').Server;
const debug = require('debug')('test:target:ws_proxy');
const http = require('http');
const proxy = require('proxy');

const server = proxy(http.createServer());

const WS_PORT = 9093;
const PROXY_PORT = 9095;

const wss = new WebSocketServer({
  host: '127.0.0.1',
  port: WS_PORT
});

wss.on('connection', function connection(ws) {
  debug('+ client');

  ws.on('message', function incoming(message) {
    debug(message);
  });

  ws.send('something');
});

server.on('connect', (_, socket) => {
  debug(`+ proxy connection ${socket.remoteAddress}`);
});

server.on('listening', () => {
  console.log(`Proxy server listening on ${PROXY_PORT}`);
});

server.listen(PROXY_PORT, '127.0.0.1');
