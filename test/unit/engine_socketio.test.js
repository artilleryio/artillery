/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const EventEmitter = require('events');
const test = require('tape');
const SocketIoEngine = require('../../lib/engine_socketio');

const script = {
  config: {
    target: 'http://localhost:8888'
  },
  scenarios: [
    {
      name: 'Whatever',
      flow: [
        {
          emit: {
            channel: 'echo',
            data: 'hello Socket.io'
          }
        }
      ]
    }
  ]
};
test('SocketIo enginge interface', function(t) {
  const engine = new SocketIoEngine(script);
  const ee = new EventEmitter();

  const runScenario = engine.createScenario(script.scenarios[0], ee);

  t.assert(engine, 'Can init the engine');
  t.assert(typeof runScenario === 'function', 'Can create a virtual user function');
  t.end();
});
