const { test, beforeEach, afterEach } = require('tap');
const { runGenericRunnerTest } = require('./helper');
const createTestServer = require('../../targets/express_socketio');
const { once } = require('events');

let server;
let port;
beforeEach(async () => {
  server = createTestServer().listen(0);
  await once(server, 'listening');
  console.log('Express Socket.io listening on %s', port);
  port = server.address().port;
});

afterEach(() => {
  server.close();
});

test('socketio with http works', (t) => {
  const script = require('../../scripts/express_socketio.json');
  script.config.target = `http://127.0.0.1:${port}`;

  runGenericRunnerTest(script, t);
});
