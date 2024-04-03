const { test, beforeEach, afterEach } = require('tap');
const { runGenericRunnerTest } = require('./helper');
const createTestServer = require('../../targets/simple_ws');

let server;
let port;
beforeEach(async () => {
  server = createTestServer().listen(0, function () {
    port = server.address().port;
  });
});

afterEach(() => {
  server.close();
});

test('generic ws test works', (t) => {
  const script = require('../../scripts/hello_ws.json');
  script.config.target = `ws://127.0.0.1:${port}`;

  runGenericRunnerTest(script, t);
});
