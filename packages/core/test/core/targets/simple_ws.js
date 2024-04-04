const { createServer } = require('http');
const WebSocketServer = require('ws').Server;

const createTestServer = (port, host = '127.0.0.1') => {
  const server = createServer();

  const wss = new WebSocketServer({
    server,
    handleProtocols
  });

  let MESSAGE_COUNT = 0;
  let CONNECTION_COUNT = 0;

  wss.on('connection', function connection(ws) {
    CONNECTION_COUNT++;
    console.log('+ connection');
    ws.on('message', function incoming(message) {
      MESSAGE_COUNT++;
      console.log('received: %s', message);
    });

    ws.send('something');
  });

  function handleProtocols(protocols, request) {
    const SUBPROTOCOL = 'my-custom-protocol';
    if (protocols.indexOf(SUBPROTOCOL) > -1) {
      console.log('setting', SUBPROTOCOL);
      return SUBPROTOCOL;
    } else {
      console.log('Unsupported subprotocols', protocols);
      return false;
    }
  }

  return server;
};

module.exports = createTestServer;
