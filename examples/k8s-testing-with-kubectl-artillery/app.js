const http = require('http');
const app = require('./http');

const { log } = console;

const PORT = process.env.PORT || 3001;
const server = http.createServer(app);

server.listen(PORT, () => {
  log(`Server listening on port ${PORT}`);
});
