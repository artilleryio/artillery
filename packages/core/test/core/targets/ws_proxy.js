const WebSocketServer = require('ws').Server;
const debug = require('debug')('test:target:ws_proxy');
const http = require('http');
const { createProxy } = require('proxy');

const createTestServers = (wsPort, proxyPort) => {
  const proxyServer = createProxy(http.createServer());
  const wsServer = http.createServer();

  const wss = new WebSocketServer({
    server: wsServer
  });

  wss.on('connection', function connection(ws) {
    debug('+ client');

    ws.on('message', function incoming(message) {
      debug(message);
    });

    ws.send('something');
  });

  wsServer.on('connect', (_, socket) => {
    debug(`+ proxy connection ${socket.remoteAddress}`);
  });

  return { wsServer, proxyServer };
};

if (require.main === module) {
  const WS_PORT = 9093;
  const PROXY_PORT = 9095;
  createTestServers(WS_PORT, PROXY_PORT).listen(PROXY_PORT, '127.0.0.1');
}

module.exports = createTestServers;
