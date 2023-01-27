/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const test = require('tape');
const EventEmitter = require('events');

const ExampleEngine = require('..');

const script = {
  config: {
    target: 'my-endpoint',
    example: {
      mandatoryString: 'hello-world'
    }
  },
  scenarios: [{
    name: 'test scenario',
    engine: 'example',
    flow: [
      {
        doSomething: {
          id: 123
        }
      }
    ]
  }]
};

test('Engine interface', function (t) {
  const events = new EventEmitter();
  const engine = new ExampleEngine(script, events, {});
  const scenario = engine.createScenario(script.scenarios[0], events);
  t.assert(engine, 'Can construct an engine');
  t.assert(typeof scenario === 'function', 'Can create a scenario');
  t.end();
});
