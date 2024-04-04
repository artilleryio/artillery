'use strict';

const { test } = require('tap');
const runner = require('../../..').runner.runner;
const http = require('http');
const WebSocket = require('ws');

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
              payload: 'should match a websocket response without capture',
              match: { json: '$.foo', value: 'bar' }
            }
          }
        ]
      }
    ]
  };

  runner(script).then(function (ee) {
    ee.on('done', (report) => {
      let c = report.counters;
      t.equal(c['vusers.failed'], 0, 'There should be no failures');
      t.equal(c['websocket.messages_sent'], 1, 'All messages should be sent');

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
      ws.send(JSON.stringify({ bar: 'foo' }));
      setTimeout(() => {
        ws.send(JSON.stringify({ bar: 'baz' }));
      }, 100);
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
              payload: 'should wait for a websocket response without send',
              match: { json: '$.bar', value: 'foo' }
            }
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
    ee.on('done', (report) => {
      let c = report.counters;
      t.equal(c['vusers.failed'], 0, 'There should be no failures');
      t.equal(c['websocket.messages_sent'], 1, 'All messages should be sent');
      t.equal(
        c['websocket.messages_received'],
        2,
        'All messages should be received'
      );

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
      ws.send(JSON.stringify({ baz: 'foo' }));
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
            loop: [
              {
                send: {
                  payload:
                    'should wait for multiple websocket responses in a loop',
                  match: { json: '$.baz', value: 'foo' }
                }
              }
            ],
            count: 5
          }
        ]
      }
    ]
  };

  runner(script).then(function (ee) {
    ee.on('done', (report) => {
      let c = report.counters;
      t.equal(c['vusers.failed'], 0, 'There should be no failures');
      t.equal(c['websocket.messages_sent'], 5, 'All messages should be sent');

      ee.stop().then(() => {
        targetServer.close(t.end);
      });
    });

    ee.run();
  });
});

test('should use config.ws.timeout on capture', (t) => {
  const server = http.createServer();
  const wss = new WebSocket.Server({ server: server });
  const targetServer = server.listen(0);

  wss.on('connection', function (ws) {
    ws.on('message', function () {
      setTimeout(() => {
        ws.send(JSON.stringify({ foo: 'bar' }));
      }, 2000);
    });
  });

  const script = {
    config: {
      target: `ws://127.0.0.1:${targetServer.address().port}`,
      phases: [{ duration: 1, arrivalCount: 1 }],
      ws: { timeout: 1 }
    },
    scenarios: [
      {
        engine: 'ws',
        flow: [
          {
            send: {
              payload: 'should timeout on capture',
              capture: { json: '$.foo', as: 'bar' }
            }
          }
        ]
      }
    ]
  };

  runner(script).then(function (ee) {
    ee.on('done', (report) => {
      let c = report.counters;
      t.equal(c['vusers.failed'], 1, 'There should be one failure');
      t.equal(c['websocket.messages_sent'], 1, 'All messages should be sent');
      ee.stop().then(() => {
        targetServer.close(t.end);
      });
    });

    ee.run();
  });
});

test('should use config.timeout on capture', (t) => {
  const server = http.createServer();
  const wss = new WebSocket.Server({ server: server });
  const targetServer = server.listen(0);

  wss.on('connection', function (ws) {
    ws.on('message', function () {
      setTimeout(() => {
        ws.send(JSON.stringify({ foo: 'bar' }));
      }, 2000);
    });
  });

  const script = {
    config: {
      target: `ws://127.0.0.1:${targetServer.address().port}`,
      phases: [{ duration: 1, arrivalCount: 1 }],
      timeout: 1
    },
    scenarios: [
      {
        engine: 'ws',
        flow: [
          {
            send: {
              payload: 'should timeout on capture',
              capture: { json: '$.foo', as: 'bar' }
            }
          }
        ]
      }
    ]
  };

  runner(script).then(function (ee) {
    ee.on('done', (report) => {
      let c = report.counters;
      t.equal(c['vusers.failed'], 1, 'There should be one failure');
      t.equal(c['websocket.messages_sent'], 1, 'All messages should be sent');
      ee.stop().then(() => {
        targetServer.close(t.end);
      });
    });

    ee.run();
  });
});

test('should allow an empty string payload to be sent', (t) => {
  const server = http.createServer();
  const wss = new WebSocket.Server({ server: server });
  const targetServer = server.listen(0);

  wss.on('connection', function (ws) {
    ws.on('message', function () {
      ws.send(JSON.stringify({ bar: 'baz' }));
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
              payload: '',
              match: { json: '$.bar', value: 'baz' }
            }
          }
        ]
      }
    ]
  };

  runner(script).then(function (ee) {
    ee.on('done', (report) => {
      let c = report.counters;
      t.equal(c['vusers.failed'], 0, 'There should be no failures');
      t.equal(c['websocket.messages_sent'], 1, 'All messages should be sent');

      ee.stop().then(() => {
        targetServer.close(t.end);
      });
    });

    ee.run();
  });
});

test('should allow a simple empty string to be sent', (t) => {
  const server = http.createServer();
  const wss = new WebSocket.Server({ server: server });
  const targetServer = server.listen(0);

  wss.on('connection', function (ws) {
    ws.on('message', function () {
      ws.send(JSON.stringify({ bar: 'baz' }));
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
            send: ''
          }
        ]
      }
    ]
  };

  runner(script).then(function (ee) {
    ee.on('done', (report) => {
      let c = report.counters;
      t.equal(c['vusers.failed'], 0, 'There should be no failures');
      t.equal(c['websocket.messages_sent'], 1, 'All messages should be sent');

      ee.stop().then(() => {
        targetServer.close(t.end);
      });
    });

    ee.run();
  });
});

test('should match allow an undefined variable to be sent', (t) => {
  const server = http.createServer();
  const wss = new WebSocket.Server({ server: server });
  const targetServer = server.listen(0);

  wss.on('connection', function (ws) {
    ws.on('message', function () {
      ws.send(JSON.stringify({ baz: 'foo' }));
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
            send: '{{ nothing }}'
          }
        ]
      }
    ]
  };

  runner(script).then(function (ee) {
    ee.on('done', (report) => {
      let c = report.counters;
      t.equal(c['vusers.failed'], 0, 'There should be no failures');
      t.equal(c['websocket.messages_sent'], 1, 'All messages should be sent');

      ee.stop().then(() => {
        targetServer.close(t.end);
      });
    });

    ee.run();
  });
});

test('should report an error if a step is not valid', (t) => {
  const server = http.createServer();
  const wss = new WebSocket.Server({ server: server });
  const targetServer = server.listen(0);

  wss.on('connection', function (ws) {
    ws.on('message', function () {
      ws.send(JSON.stringify({ baz: 'foo' }));
    });
  });

  const script = {
    config: {
      target: `ws://127.0.0.1:${targetServer.address().port}`,
      phases: [{ duration: 1, arrivalCount: 1 }]
    },
    scenarios: [{ engine: 'ws', flow: [{ sedn: 'test' }] }]
  };

  runner(script).then(function (ee) {
    ee.on('done', (report) => {
      let c = report.counters;
      t.equal(c['vusers.failed'], 1, 'There should be one failure');
      t.equal(c['errors.invalid_step'], 1, 'There should be one error');

      ee.stop().then(() => {
        targetServer.close(t.end);
      });
    });

    ee.run();
  });
});
