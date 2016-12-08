var http = require('http').createServer(handler);
var io = require('socket.io')(http);
var PORT = 9091;

http.listen(PORT, function() {
  console.log('Socket.io listening on %s', PORT);
});

var MESSAGE_COUNT = 0;
var CONNECTION_COUNT = 0;
var PRINT_NS_CONNECTIONS = false;
var CONNECTIONS = {
  nsp1: {connections: 0, messages: 0},
  nsp2: {connections: 0, messages: 0}
};



io.of('/nsp1').on('connection', function connection(ws){
  PRINT_NS_CONNECTIONS = true;
  CONNECTIONS.nsp1.connections++;
  console.log('+ Socket.io new connection in /nsp1');
  ws.on('echo', function incoming(message){
    CONNECTIONS.nsp1.messages++;
    console.log('Socket.io /nsp1 echoing message: %s', message);
    ws.emit('echoed:nsp1', message);
  });
});

io.of('/nsp2').on('connection', function connection(ws){
  PRINT_NS_CONNECTIONS = true;
  CONNECTIONS.nsp2.connections++;
  console.log('+ Socket.io new connection in /nsp2');
  ws.on('echo', function incoming(message){
    CONNECTIONS.nsp2.messages++;
    console.log('Socket.io /nsp2 echoing message: %s', message);
    ws.emit('echoed:nsp2', message);
  });
});



io.on('connection', function connection(ws) {
  CONNECTION_COUNT++;
  console.log('+ Socket.io connection');

  ws.on('echo', function incoming(message) {
    MESSAGE_COUNT++;
    console.log('Socket.io echoing message: %s', message);
    ws.emit('echoed', message);
  });
});

setInterval(function() {
  console.log(new Date());
  console.log('CONNECTION_COUNT [socketio] = %s', CONNECTION_COUNT);
  console.log('MESSAGE_COUNT    [socketio] = %s', MESSAGE_COUNT + CONNECTIONS.nsp1.messages + CONNECTIONS.nsp2.messages);
  if(PRINT_NS_CONNECTIONS) {
    console.log('CONNECTIONS      [socketio] = %s', JSON.stringify(CONNECTIONS));
  }
}, 5 * 1000);

function handler(req, res) {
  res.writeHead(404);
  res.end('No http pages here');
}
