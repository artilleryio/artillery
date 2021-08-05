const socketio = require('socket.io');

const { log } = console;

module.exports = (server) => {
  const io = socketio(server);

  io.on('connect', (client) => {
    function onEcho(m) {
      log('Echo message', m);

      client.emit('echoResponse', m);
    }

    function onDisconnect() {
      log(`Received: disconnect event from client: ${client.id}`);

      client.removeListener('echo', onEcho);
      client.removeListener('disconnect', onDisconnect);
    }

    client.on('disconnect', onDisconnect);
    client.on('echo', onEcho);
  });

  io.on('connect_error', (err) => {
    log('connectError, ', err);
  });

  return io;
};
