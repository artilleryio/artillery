const http = require('node:http');
const app = require('./http');
const socketio = require('./socketio');

const { log } = console;

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

socketio(server);

server.listen(PORT, () => {
  log(`Server listening on port ${PORT}`);
});
