const { test, beforeEach, afterEach } = require('tap');
const runner = require('../..').runner.runner;
const { SSMS } = require('../../lib/ssms');
const http = require('http');
const WebSocket = require('ws');
const { once } = require('events');

let targetServer;
let wss;

beforeEach(async () => {
  const server = http.createServer();
  wss = new WebSocket.Server({ server: server });
  targetServer = server.listen(0);
  await once(targetServer, 'listening');
});

afterEach(() => {
  targetServer.close();
});

test('Capture WS - JSON', (t) => {
  wss.on('connection', function (ws) {
    ws.on('message', function (message) {
      t.match(message, /hello (ws|bar|foo)/, 'matches incoming message');
      ws.send(JSON.stringify({ foo: 'bar', baz: 'foo' }));
    });
  });

  const script = {
    config: {
      target: `ws://127.0.0.1:${targetServer.address().port}`,
      phases: [{ duration: 2, arrivalRate: 5 }]
    },
    scenarios: [
      {
        engine: 'ws',
        flow: [
          {
            send: { payload: 'hello ws', capture: { json: '$.foo', as: 'foo' } }
          },
          { think: 1 },
          {
            send: {
              payload: 'hello {{ foo }}',
              capture: { json: '$.baz', as: 'baz' }
            }
          },
          { loop: [{ send: 'hello {{ baz }}' }], count: 5 }
        ]
      }
    ]
  };

  runner(script).then(function (ee) {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();

      t.equal(
        Object.keys(report.errors).length,
        0,
        'There should be no WS errors'
      );

      ee.stop().then(() => {
        t.end();
      });
    });

    ee.run();
  });
});
