var http = require('http');
var socketio = require('socket.io');
const debug = require('debug')('target:socketio');
module.exports = createServer;

if (require.main === module) {
  const server = createServer();
  var PORT = 9091;
  server.listen(PORT, function () {
    console.log('Socket.io listening on %s', PORT);
  });
}

function createServer() {
  var server = http.createServer(handler);
  var io = socketio(server);

  var CONNECTIONS = {
    nsp1: { connections: 0, messages: 0 },
    nsp2: { connections: 0, messages: 0 }
  };

  io.of('/nsp1').on('connect', function connection(ws) {
    CONNECTIONS.nsp1.connections++;
    debug('+ Socket.io new connection in /nsp1');
    ws.on('echo', function incoming(message) {
      CONNECTIONS.nsp1.messages++;
      debug('Socket.io /nsp1 echoing message: %s', message);
      ws.emit('echoed:nsp1', message);
    });
  });

  io.of('/nsp2').on('connect', function connection(ws) {
    CONNECTIONS.nsp2.connections++;
    debug('+ Socket.io new connection in /nsp2');
    ws.on('echo', function incoming(message) {
      CONNECTIONS.nsp2.messages++;
      debug('Socket.io /nsp2 echoing message: %s', message);
      ws.emit('echoed:nsp2', message);
    });
  });

  io.on('connect', function connection(ws) {
    debug('+ Socket.io connection');

    setTimeout(function () {
      ws.emit('hello', 'whatever');
    }, 500);

    let loopCounter = 0;
    ws.on('echo', function incoming(message, cb) {
      if (message === 'ping') {
        cb('pong', { answer: 42 });
      }
      if (message === 'count:inc') {
        loopCounter++;
        cb('count', { answer: loopCounter });
      }
      if (message === 'count:reset') {
        loopCounter = 0;
        cb('count', { answer: loopCounter });
      }
      if (message === 'count:read') {
        cb('count', { answer: loopCounter });
      }

      debug('Socket.io echoing message: %s', message);
      ws.emit('echoed', message);
    });

    ws.on('message', function incoming(...messages) {
      debug('Socket.io message: %s', messages);
      const [message, cb] = messages;

      if (message === 'hello socket io') {
        cb('hello!');
      } else if (typeof messages[messages.length - 1] === 'function') {
        messages[messages.length - 1]('hi');
      } else {
        ws.emit('echoed', `${messages}`);
      }
    });
  });

  function handler(req, res) {
    res.writeHead(404);
    res.end('No http pages here');
  }

  return io;
}
