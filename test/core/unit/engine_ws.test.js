/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const test = require('tape');
const sinon = require('sinon');
const rewiremock = require('rewiremock/node');

const HttpsProxyAgent = require('https-proxy-agent');
const EventEmitter = require('events');
let WebSocketEngine;

const script = {
  config: {
    target: 'ws://localhost:9093',
    phases: [{ duration: 1, arrivalCount: 1 }],
    ws: {
      proxy: {
        url: 'http://localhost:9095',
        localAddress: '127.0.0.2',
      },
    },
  },
  scenarios: [
    {
      engine: 'ws',
      flow: [{ send: 'hello' }],
    },
  ],
};

let sandbox;
let WebsocketMock;
let wsMockInstance;

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
  const engine = new WebSocketEngine(script);
  const ee = new EventEmitter();

  const runScenario = engine.createScenario(script.scenarios[0], ee);

  ee.on('started', () => {
    process.nextTick(() => wsMockInstance.emit('open'));
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

test('WebSocket engine - teardown', (t) => {
  sandbox.restore();
  rewiremock.disable();

  t.end();
});
