/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const EventEmitter = require('events');
const { test, beforeEach, afterEach, before } = require('tap');
const SocketIoEngine = require('../../../lib/engine_socketio');

const { updateGlobalObject } = require('../../../index');

const createTestServer = require('../targets/simple_socketio');

const script = {
  config: {
    target: 'http://localhost:10333'
  },
  scenarios: [
    {
      name: 'Whatever',
      flow: [
        {
          emit: ['testEvent', 'hello', 'Socket.io'],
          acknowledge: true
        }
      ]
    }
  ]
};

const scriptWithoutEmits = {
  config: {
    target: 'http://localhost:10334'
  },
  scenarios: [
    {
      flow: [{ think: 1 }]
    }
  ]
};

let ioServer;
let server;
let port;
beforeEach(async () => {
  const serverInfo = await createTestServer();
  ioServer = serverInfo.io;
  server = serverInfo.server;
  port = serverInfo.port;
});
before(async () => await updateGlobalObject());

afterEach(() => {
  server.close();
});

test('SocketIo engine interface', (t) => {
  script.config.target = `http://localhost:${port}`;

  const engine = new SocketIoEngine(script);
  const ee = new EventEmitter();

  const runScenario = engine.createScenario(script.scenarios[0], ee);

  t.ok(engine, 'Can init the engine');
  t.type(runScenario, 'function', 'Can create a virtual user function');

  t.end();
});

test('Passive listening', (t) => {
  scriptWithoutEmits.config.target = `http://127.0.0.1:${port}`;
  const engine = new SocketIoEngine(scriptWithoutEmits);
  const ee = new EventEmitter();

  const runScenario = engine.createScenario(
    scriptWithoutEmits.scenarios[0],
    ee
  );
  const initialContext = {
    vars: {}
  };

  runScenario(initialContext, function userDone(err, finalContext) {
    t.ok(!err, 'Scenario completed with no errors');
    t.equal(
      finalContext.__receivedMessageCount,
      1,
      'Should have received one message upon connecting'
    );

    t.end();
  });
});

test('Sends event', function (t) {
  const testScript = {
    ...script,
    config: {
      target: `http://localhost:${port}`
    }
  };

  const engine = new SocketIoEngine(testScript);
  const ee = new EventEmitter();
  const [scenario] = testScript.scenarios;
  const {
    flow: [{ emit: emittedData }]
  } = scenario;

  const runScenario = engine.createScenario(scenario, ee);
  const initialContext = {
    vars: {}
  };
  const [channel, ...messages] = emittedData;

  ioServer.of('/').on('connection', (ws) => {
    ws.on(channel, (msg1, msg2, cb) => {
      t.same([msg1, msg2], messages, 'Emits messages');

      cb();
    });
  });

  runScenario(initialContext, function userDone(err) {
    t.ok(!err, 'Scenario completed with no errors');
    t.end();
  });
});
