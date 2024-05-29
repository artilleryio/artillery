const WebSocketServer = require('ws').Server;
const debug = require('debug')('test:target:ws_proxy');
const http = require('http');
const { createProxy } = require('proxy');

const createTestServers = async (wsPort, proxyPort) => {
  const proxyServer = createProxy();
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

  wsServer.listen(wsPort);
  proxyServer.listen(proxyPort);

  let maxWaitTime = 1000;
  let waitTime = 0;
  while (
    !wsServer.listening ||
    !proxyServer.listening ||
    waitTime < maxWaitTime
  ) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    waitTime += 100;
  }

  if (waitTime > maxWaitTime) {
    throw new Error('Timeout: servers did not start');
  }

  return { wsServer, proxyServer };
};

module.exports = createTestServers;
