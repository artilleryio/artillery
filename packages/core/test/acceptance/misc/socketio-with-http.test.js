const { test, beforeEach, afterEach } = require('tap');
const { runGenericRunnerTest } = require('./helper');
const createTestServer = require('../../targets/express_socketio');

let server;
let port;
beforeEach(async () => {
  server = await createTestServer();
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
