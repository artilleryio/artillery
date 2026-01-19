const { createServer } = require('node:http');
const { Server } = require('socket.io');
const { once } = require('node:events');

const createTestServer = async (port) => {
  function handler(_req, res) {
    res.writeHead(404);
    res.end('No http pages here');
  }

  const httpServer = createServer(handler);
  const io = new Server(httpServer);

  io.on('connection', (socket) => {
    socket.on('join', (channel) => {
      socket.join(channel);
      socket.emit('new_user_join', `Welcome to ${channel}`);
    });

    socket.on('message', (channel, ...message) => {
      console.log(channel);
      console.log(message);
      io.in(channel).emit('message_response', channel, ...message);
    });

    socket.on('new_server_version', (message1, message2, callback) => {
      callback(message1, message2);
    });

    socket.on('new_server_version_as_object', (message1, callback) => {
      callback({
        version: message1
      });
    });
  });

  httpServer.listen(port || 0);
  await once(httpServer, 'listening');
  console.log(
    'Express Socket.io with args listening on %s',
    httpServer.address().port
  );

  return httpServer;
};

module.exports = createTestServer;
