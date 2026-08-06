const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { runGenericRunnerTest } = require('./helper');
const createTestServer = require('../../targets/simple');

let server;
let port;
beforeEach(async () => {
  server = await createTestServer(0);
  port = server.info.port;
});

afterEach(() => {
  server.stop();
});

test('generic http test works', async () => {
  const script = require('../../scripts/large_payload.json');
  script.config.target = `http://127.0.0.1:${port}`;

  await runGenericRunnerTest(script);
});
