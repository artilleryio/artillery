'use strict';

const { test } = require('tap');
const runner = require('../../core').runner;
const http = require('http');
const WebSocket = require('ws');
const { SSMS } = require('../../core/lib/ssms');

test('should match a websocket response without capture', (t) => {
  const server = http.createServer();
  const wss = new WebSocket.Server({ server: server });
  const targetServer = server.listen(0);

  wss.on('connection', function (ws) {
    ws.on('message', function () {
      ws.send(JSON.stringify({ foo: 'bar' }));
    });
  });

  const script = {
    config: {
      target: `ws://127.0.0.1:${targetServer.address().port}`,
      phases: [{ duration: 1, arrivalCount: 1 }]
    },
    scenarios: [
      {
        engine: 'ws',
        flow: [
          {
            send: {
              payload: 'hello',
              match: { json: '$.foo', value: 'bar' }
            }
          }
        ]
      }
    ]
  };

  runner(script).then(function (ee) {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();

      t.ok(
        Object.keys(report.errors).length === 0,
        'There should be no errors'
      );

      ee.stop().then(() => {
        targetServer.close(t.end);
      });
    });

    ee.run();
  });
});

test('should timeout checks if server goes quiet', (t) => {
  const server = http.createServer();
  const wss = new WebSocket.Server({ server: server });
  const targetServer = server.listen(0);

  wss.on('connection', function (ws) {
    ws.on('message', function () {
      ws.send(JSON.stringify({ foo: 'bar' }));
    });
  });

  const script = {
    config: {
      target: `ws://127.0.0.1:${targetServer.address().port}`,
      phases: [{ duration: 1, arrivalCount: 1 }]
    },
    scenarios: [
      {
        engine: 'ws',
        flow: [
          {
            send: {
              payload: 'hello',
              match: { json: '$.foo', value: 'bar' }
            },
          },
          {
            wait: {
              match: { json: '$.bar', value: 'baz' },
              timeout: 5,
            }
          }
        ]
      }
    ]
  };

  runner(script).then(function (ee) {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();

      t.ok(Object.keys(report.errors).length === 1, 'There should be a timeout error');

      ee.stop().then(() => {
        targetServer.close(t.end);
      });
    });

    ee.run();
  });
});

test('immediate match only looks at one message', (t) => {
  const server = http.createServer();
  const wss = new WebSocket.Server({ server: server });
  const targetServer = server.listen(0);

  wss.on('connection', function (ws) {
    ws.on('message', function () {
      ws.send(JSON.stringify({ foo: 'foo' }));

      setTimeout(() => ws.send(JSON.stringify({ foo: 'bar' }), 400));
      setTimeout(() => ws.send(JSON.stringify({ bar: 'baz' }), 500));
    });
  });

  const script = {
    config: {
      target: `ws://127.0.0.1:${targetServer.address().port}`,
      phases: [{ duration: 1, arrivalCount: 1 }]
    },
    scenarios: [
      {
        engine: 'ws',
        flow: [
          {
            send: {
              payload: 'hello',
              match: { json: '$.foo', value: 'bar' }
            },
          },
          {
            wait: {
              match: { json: '$.bar', value: 'baz' },
              timeout: 5,
            }
          }
        ]
      }
    ]
  };

  runner(script).then(function (ee) {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();
      
      t.ok(Object.keys(report.errors).length === 1, 'There should be a timeout error');

      ee.stop().then(() => {
        targetServer.close(t.end);
      });
    });

    ee.run();
  });
});

test('should wait for a websocket response without send', (t) => {
  const server = http.createServer();
  const wss = new WebSocket.Server({ server: server });
  const targetServer = server.listen(0);

  wss.on('connection', function (ws) {
    ws.on('message', function () {
      ws.send(JSON.stringify({ foo: 'bar' }));

      setTimeout(() => ws.send(JSON.stringify({ bar: 'will not match' }), 100));
      setTimeout(() => ws.send(JSON.stringify({ bar: 'will not match' }), 200));

      setTimeout(() => ws.send(JSON.stringify({ bar: 'baz' }), 500));
    });
  });

  const script = {
    config: {
      target: `ws://127.0.0.1:${targetServer.address().port}`,
      phases: [{ duration: 1, arrivalCount: 1 }]
    },
    scenarios: [
      {
        engine: 'ws',
        flow: [
          {
            send: {
              payload: 'hello',
              match: { json: '$.foo', value: 'bar' }
            },
          },
          {
            wait: {
              match: { json: '$.bar', value: 'baz' }
            }
          }
        ]
      }
    ]
  };

  runner(script).then(function (ee) {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();

      t.ok(Object.keys(report.errors).length === 0, 'The wait should match');

      ee.stop().then(() => {
        targetServer.close(t.end);
      });
    });

    ee.run();
  });
});

test('should wait for multiple websocket responses in a loop', (t) => {
  const server = http.createServer();
  const wss = new WebSocket.Server({ server: server });
  const targetServer = server.listen(0);

  wss.on('connection', function (ws) {
    ws.on('message', function () {
      ws.send(JSON.stringify({ foo: 'bar' }));
      for (let i = 0; i < 5; i++) {
        setTimeout(() => ws.send(JSON.stringify({ bar: 'baz' }), i * 100));
      }
    });
  });

  const script = {
    config: {
      target: `ws://127.0.0.1:${targetServer.address().port}`,
      phases: [{ duration: 1, arrivalCount: 1 }]
    },
    scenarios: [
      {
        engine: 'ws',
        flow: [
          { send: 'hello' },
          {
            loop: [
              { wait:
                { match: { json: '$.bar', value: 'baz' } }
              }
            ],
            count: 5
          }
        ]
      }
    ]
  };

  runner(script).then(function (ee) {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();

      t.ok(Object.keys(report.errors).length === 0, 'All waits should match');
      ee.stop().then(() => {
        targetServer.close(t.end);
      });
    });

    ee.run();
  });
});
