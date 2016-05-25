var WebSocketServer = require('ws').Server;
var wss = new WebSocketServer({host: '127.0.0.1', port: 9090});

var MESSAGE_COUNT = 0;
var CONNECTION_COUNT = 0;

wss.on('connection', function connection(ws) {
  CONNECTION_COUNT++;
  console.log('+ connection');
  ws.on('message', function incoming(message) {
    MESSAGE_COUNT++;
    console.log('received: %s', message);
  });

  ws.send('something');
});

setInterval(function() {
  console.log(new Date());
  console.log('CONNECTION_COUNT [ws] = %s', CONNECTION_COUNT);
  console.log('MESSAGE_COUNT    [ws] = %s', MESSAGE_COUNT);
}, 5 * 1000);
