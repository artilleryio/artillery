/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const test = require('tape');
const sinon = require('sinon');
const rewiremock = require('rewiremock/node');

const HttpsProxyAgent = require('https-proxy-agent');
const EventEmitter = require('events');
const _ = require('lodash');

const baseScript = {
  config: {
    target: 'ws://localhost:9093',
    phases: [{ duration: 1, arrivalCount: 1 }],
    ws: {}
  },
  scenarios: [
    {
      engine: 'ws',
      flow: [{ send: 'hello' }]
    }
  ]
};

let sandbox;
let WebsocketMock;
let wsMockInstance;
let WebSocketEngine;

test('WebSocket engine - setup', (t) => {
  sandbox = sinon.sandbox.create();
  rewiremock.enable();

  class WsMockInstance extends EventEmitter {
    constructor() {
      super();
    }
    close() {}
  }

  WsMockInstance.prototype.send = sandbox.stub().yields();

  wsMockInstance = new WsMockInstance();

  WebsocketMock = sandbox.stub().returns(wsMockInstance);

  rewiremock('ws').with(WebsocketMock);

  WebSocketEngine = require('../../../core/lib/engine_ws');

  t.end();
});

test('WebSocket engine - proxy', (t) => {
  const script = _.cloneDeep(baseScript);

  WebsocketMock.resetHistory();

  script.config.ws = {
    proxy: {
      url: 'http://localhost:9095',
      localAddress: '127.0.0.2'
    }
  };

  const engine = new WebSocketEngine(script);
  const ee = new EventEmitter();

  const runScenario = engine.createScenario(script.scenarios[0], ee);

  ee.on('started', () => {
    // simulate connection
    setTimeout(() => {
      wsMockInstance.emit('open');
    }, 200);
  });

  runScenario({}, (err) => {
    const [, , websocketOptions] = WebsocketMock.args[0];

    t.assert(!err, 'Virtual user finished successfully');
    t.true(
      websocketOptions.agent instanceof HttpsProxyAgent,
      'Passes an agent to the WebSocket constructor'
    );
    t.true(
      websocketOptions.agent.proxy.href.startsWith(script.config.ws.proxy.url),
      'Gets the proxy url from the scenario'
    );
    t.equal(
      websocketOptions.agent.proxy.localAddress,
      script.config.ws.proxy.localAddress,
      'Passes additional configuration properties to the agent constructor'
    );

    t.end();
  });
});

test('WebSocket engine - connect action (string)', (t) => {
  const script = _.cloneDeep(baseScript);

  WebsocketMock.resetHistory();

  script.scenarios[0].flow = [
    { connect: '{{ target }}/endpoint' },
    ...script.scenarios[0].flow
  ];

  const expectedTarget = `${script.config.target}/endpoint`;

  const engine = new WebSocketEngine(script);
  const ee = new EventEmitter();

  const runScenario = engine.createScenario(script.scenarios[0], ee);

  ee.on('started', () => {
    setTimeout(() => {
      wsMockInstance.emit('open');
    }, 200);
  });

  runScenario(
    {
      vars: {
        target: script.config.target
      }
    },
    (err) => {
      const [target] = WebsocketMock.args[0];

      t.assert(!err, 'Virtual user finished successfully');
      t.equal(target, expectedTarget, 'Templates connection target');

      t.end();
    }
  );
});

test('WebSocket engine - connect action (function)', (t) => {
  t.plan(4);
  const script = _.cloneDeep(baseScript);

  WebsocketMock.resetHistory();

  const context = {
    vars: {
      target: script.config.target
    }
  };
  const expectedSubProtocol = 'wamp';

  script.config.processor = {
    connectionHook: (params, userContext, callback) => {
      t.equals(
        params.target,
        script.config.target,
        'Processor fn receives global config target'
      );
      t.deepEqual(userContext, context, 'Processor fn receives user\'s context');

      params.subprotocols = [expectedSubProtocol];

      callback();
    }
  };

  script.scenarios[0].flow = [
    { connect: { function: 'connectionHook' } },
    ...script.scenarios[0].flow
  ];

  const engine = new WebSocketEngine(script);
  const ee = new EventEmitter();

  const runScenario = engine.createScenario(script.scenarios[0], ee);

  ee.on('started', () => {
    setTimeout(() => {
      wsMockInstance.emit('open');
    }, 200);
  });

  runScenario(context, (err) => {
    const [, subprotocols] = WebsocketMock.args[0];

    t.assert(!err, 'Virtual user finished successfully');
    t.deepEqual(
      subprotocols,
      [expectedSubProtocol],
      'Processor fn can set WS constructor parameters'
    );
  });
});

test('WebSocket engine - connect action (object)', (t) => {
  const script = _.cloneDeep(baseScript);

  WebsocketMock.resetHistory();

  const context = {
    vars: {}
  };
  const expectedSubProtocol = 'wamp';

  const connectHook = {
    target: 'ws://target1',
    subprotocols: [expectedSubProtocol],
    headers: {
      'Sec-WebSocket-Key': 'abcde'
    },
    proxy: {
      url: 'http://proxy1'
    }
  };

  script.scenarios[0].flow = [
    { connect: connectHook },
    ...script.scenarios[0].flow
  ];

  const engine = new WebSocketEngine(script);
  const ee = new EventEmitter();

  const runScenario = engine.createScenario(script.scenarios[0], ee);

  ee.on('started', () => {
    setTimeout(() => {
      wsMockInstance.emit('open');
    }, 200);
  });

  runScenario(context, (err) => {
    const [target, subprotocols, wsOptions] = WebsocketMock.args[0];

    t.assert(!err, 'Virtual user finished successfully');
    t.equals(target, connectHook.target, 'Overrides connection target');
    t.ok(
      wsOptions.agent.proxy.href.startsWith(connectHook.proxy.url),
      'Gets the proxy url from the connect object'
    );

    t.deepEqual(
      subprotocols,
      connectHook.subprotocols,
      'Gets suprotocols from the connect object'
    );

    t.deepEqual(
      wsOptions.headers,
      {
        'Sec-WebSocket-Key': 'abcde'
      },
      'Gets headers from the connect object'
    );

    t.end();
  });
});

test('WebSocket engine - teardown', (t) => {
  sandbox.restore();
  rewiremock.disable();

  t.end();
});
