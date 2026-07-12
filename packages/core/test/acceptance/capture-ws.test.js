const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
let runner;
let SSMS;
const http = require('node:http');
const WebSocket = require('ws');
const { once } = require('node:events');

let targetServer;
let wss;

const __tap = require('node:test');
// Modules under test are ES modules - load before tests run
__tap.before(async () => {
  runner = (await import('../../index.ts')).runner.runner;
  ({ SSMS } = await import('../../lib/ssms.ts'));
});

beforeEach(async () => {
  const server = http.createServer();
  wss = new WebSocket.Server({ server: server });
  targetServer = server.listen(0);
  await once(targetServer, 'listening');
});

afterEach(() => {
  targetServer.close();
});

test('Capture WS - JSON', (t, done) => {
  wss.on('connection', (ws) => {
    ws.on('message', (message) => {
      assert.match(message, /hello (ws|bar|foo)/, 'matches incoming message');
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

  runner(script).then((ee) => {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();

      assert.strictEqual(Object.keys(report.errors).length, 0, 'There should be no WS errors');

      ee.stop().then(() => {
        done();
      });
    });

    ee.run();
  });
});
