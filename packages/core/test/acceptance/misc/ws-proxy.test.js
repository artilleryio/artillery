const { test, beforeEach, afterEach } = require('tap');
const { runGenericRunnerTest } = require('./helper');
const createTestServers = require('../../targets/ws_proxy');

let server;
let proxyServer;
let port;
let proxyPort;

beforeEach(async () => {
  const servers = await createTestServers();
  server = servers.wsServer;
  proxyServer = servers.proxyServer;
  port = server.address().port;
  proxyPort = proxyServer.address().port;
});

afterEach(() => {
  server.close();
  proxyServer.close();
});

test('generic ws test works', (t) => {
  const script = require('../../scripts/ws_proxy.json');
  script.config.target = `ws://127.0.0.1:${port}`;
  script.config.ws.proxy.url = `http://127.0.0.1:${proxyPort}`;

  runGenericRunnerTest(script, t);
});
