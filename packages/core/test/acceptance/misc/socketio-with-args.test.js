const { test, beforeEach, afterEach } = require('tap');
const { runGenericRunnerTest } = require('./helper');
const createTestServer = require('../../targets/socketio_args');

let server;
let port;
beforeEach(async () => {
  server = await createTestServer();
  port = server.address().port;
});

afterEach(() => {
  server.close();
});

test('socketio with args works', (t) => {
  const script = require('../../scripts/hello_socketio_with_args.json');
  script.config.target = `http://127.0.0.1:${port}`;

  runGenericRunnerTest(script, t);
});
