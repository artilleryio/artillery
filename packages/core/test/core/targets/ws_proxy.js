const WebSocketServer = require('ws').Server;
const debug = require('debug')('test:target:ws_proxy');
const http = require('http');
const { createProxy } = require('proxy');

const createTestServer = (wsPort, proxyPort) => {
  const server = createProxy(http.createServer());

  //TODO: review this
  const wss = new WebSocketServer({
    host: '127.0.0.1',
    port: wsPort
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
    console.log(`Proxy server listening on ${proxyPort}`);
  });

  return server;
};

if (require.main === module) {
  const WS_PORT = 9093;
  const PROXY_PORT = 9095;
  createTestServer(WS_PORT, PROXY_PORT).listen(PROXY_PORT, '127.0.0.1');
}

module.exports = createTestServer;
