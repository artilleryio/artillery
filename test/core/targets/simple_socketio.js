var http = require('http');
var socketio = require('socket.io');
const debug = require('debug')('target:socketio');
module.exports = createServer;

if (require.main === module) {
  const server = createServer();
  var PORT = 9091;
  server.listen(PORT, function() {
    console.log('Socket.io listening on %s', PORT);
  });
}

function createServer() {
  var server = http.createServer(handler);
  var io = socketio(server);

  var MESSAGE_COUNT = 0;
  var CONNECTION_COUNT = 0;
  var PRINT_NS_CONNECTIONS = false;
  var CONNECTIONS = {
    nsp1: {connections: 0, messages: 0},
    nsp2: {connections: 0, messages: 0}
  };

  io.of('/nsp1').on('connect', function connection(ws){
    PRINT_NS_CONNECTIONS = true;
    CONNECTIONS.nsp1.connections++;
    debug('+ Socket.io new connection in /nsp1');
    ws.on('echo', function incoming(message){
      CONNECTIONS.nsp1.messages++;
      debug('Socket.io /nsp1 echoing message: %s', message);
      ws.emit('echoed:nsp1', message);
    });
  });

  io.of('/nsp2').on('connect', function connection(ws){
    PRINT_NS_CONNECTIONS = true;
    CONNECTIONS.nsp2.connections++;
    debug('+ Socket.io new connection in /nsp2');
    ws.on('echo', function incoming(message){
      CONNECTIONS.nsp2.messages++;
      debug('Socket.io /nsp2 echoing message: %s', message);
      ws.emit('echoed:nsp2', message);
    });
  });



  io.on('connect', function connection(ws) {
    CONNECTION_COUNT++;
    debug('+ Socket.io connection');

    setTimeout(function() {
      ws.emit('hello', 'whatever');
    }, 500);

    let loopCounter = 0;
    ws.on('echo', function incoming(message, cb) {
      MESSAGE_COUNT++;

      if (message === 'ping') {
        cb("pong", {answer: 42});
      }
      if (message === 'count:inc') {
        loopCounter++;
        cb('count', {answer: loopCounter});
      }
      if (message === 'count:reset') {
        loopCounter = 0;
        cb('count', {answer: loopCounter});
      }
      if (message === 'count:read') {
        cb('count', {answer: loopCounter});
      }

      debug('Socket.io echoing message: %s', message);
      ws.emit('echoed', message);
    });
  });

  if (require.main === module) {
    // setInterval(function() {
    //   console.log(new Date());
    //   console.log('CONNECTION_COUNT [socketio] = %s', CONNECTION_COUNT);
    //   console.log('MESSAGE_COUNT    [socketio] = %s', MESSAGE_COUNT + CONNECTIONS.nsp1.messages + CONNECTIONS.nsp2.messages);
    //   if(PRINT_NS_CONNECTIONS) {
    //     console.log('CONNECTIONS      [socketio] = %s', JSON.stringify(CONNECTIONS));
    //   }
    // }, 5 * 1000);
  }

  function handler(req, res) {
    res.writeHead(404);
    res.end('No http pages here');
  }


  return server;
}
