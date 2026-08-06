const { createServer } = require('node:http');
const WebSocketServer = require('ws').Server;

const createTestServer = (_port, _host = '127.0.0.1') => {
  const server = createServer();

  const wss = new WebSocketServer({
    server,
    handleProtocols
  });

  let _MESSAGE_COUNT = 0;
  let _CONNECTION_COUNT = 0;

  wss.on('connection', function connection(ws) {
    _CONNECTION_COUNT++;
    console.log('+ connection');
    ws.on('message', function incoming(message) {
      _MESSAGE_COUNT++;
      console.log('received: %s', message);
    });

    ws.send('something');
  });

  function handleProtocols(protocols, _request) {
    const SUBPROTOCOL = 'my-custom-protocol';
    if (protocols.indexOf(SUBPROTOCOL) > -1) {
      console.log('setting', SUBPROTOCOL);
      return SUBPROTOCOL;
    } else {
      console.log('Unsupported subprotocols', protocols);
      return false;
    }
  }

  return new Promise((resolve, _reject) => {
    server.listen(0, () => {
      resolve({ server, wss, port: server.address().port });
    });
  });
};

module.exports = createTestServer;
