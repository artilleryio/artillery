var app = require('express')();
app.get('/test', handler);
var http = require('http').createServer(app);
var io = require('socket.io')(http);
var PORT = 9092;

http.listen(PORT, function() {
  console.log('Express Socket.io listening on %s', PORT);
});

var MESSAGE_COUNT = 0;
var CONNECTION_COUNT = 0;

io.on('connection', function connection(ws) {
  CONNECTION_COUNT++;
  console.log('+ Express connection');
  ws.on('echo', function incoming(message) {
    MESSAGE_COUNT++;
    console.log('Express echoing message: %s', message);
    ws.emit('echoed', message);
  });


});

setInterval(function() {
  console.log(new Date());
  console.log('CONNECTION_COUNT [express] = %s', CONNECTION_COUNT);
  console.log('MESSAGE_COUNT    [express] = %s', MESSAGE_COUNT);
}, 5 * 1000);

function handler(req, res) {
  console.log('Express send HTTP OK');
  res.writeHead(200);
  res.end(JSON.stringify({ key: 'value' }));
}
