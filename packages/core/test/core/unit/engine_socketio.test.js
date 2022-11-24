/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const EventEmitter = require('events');
const { test } = require('tap');
const SocketIoEngine = require('../../../lib/engine_socketio');

const { updateGlobalObject } = require('../../../index');

const createServer = require('../targets/simple_socketio');

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

test('SocketIo Engine', function (tap) {
  tap.before(async () => await updateGlobalObject());

  tap.test('SocketIo engine interface', function (t) {
    const server = createServer();
    const target = server.httpServer;

    target.listen(10333, function () {
      const engine = new SocketIoEngine(script);
      const ee = new EventEmitter();

      const runScenario = engine.createScenario(script.scenarios[0], ee);

      t.ok(engine, 'Can init the engine');
      t.ok(
        typeof runScenario === 'function',
        'Can create a virtual user function'
      );

      target.close();
      t.end();
    });
  });

  tap.test('Passive listening', function (t) {
    const server = createServer();
    const target = server.httpServer;

    target.listen(10334, function () {
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
        t.ok(
          finalContext.__receivedMessageCount === 1,
          'Received one message upon connecting'
        );

        target.close();
        t.end();
      });
    });
  });

  tap.test('Sends event', function (t) {
    t.plan(2);

    const server = createServer();
    const target = server.httpServer;
    const PORT = 10334;

    target.listen(PORT, function () {
      const testScript = {
        ...script,
        config: {
          target: `http://localhost:${PORT}`
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

      server.of('/').on('connection', (ws) => {
        ws.on(channel, (msg1, msg2, cb) => {
          t.same([msg1, msg2], messages, 'Emits messages');

          cb();
        });
      });

      runScenario(initialContext, function userDone(err) {
        t.ok(!err, 'Scenario completed with no errors');

        target.close();
      });
    });
  });

  tap.end();
});
