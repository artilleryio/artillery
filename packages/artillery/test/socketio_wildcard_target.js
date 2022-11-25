const io = require("socket.io")(9094, {
  path: "/",
  serveClient: false
});
io.on('connect', function connection(ws) {
  console.log('Socket.io new connection');
  ws.on('echo', function incoming(message) {
    console.log('echoing message: %s', message);
    ws.emit('echo', message);
  });
});
