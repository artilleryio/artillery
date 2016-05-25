var http = require('http').createServer(handler);
var io = require('socket.io')(http);
var PORT = 9091;

http.listen(PORT, function() {
  console.log('Socket.io listening on %s', PORT);
});

var MESSAGE_COUNT = 0;
var CONNECTION_COUNT = 0;

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
  console.log('MESSAGE_COUNT    [socketio] = %s', MESSAGE_COUNT);
}, 5 * 1000);

function handler(req, res) {
  res.writeHead(404);
  res.end('No http pages here');
}
