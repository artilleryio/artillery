/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { test } = require('tap');
const EventEmitter = require('node:events');

const ExampleEngine = require('..');

const script = {
  config: {
    target: 'my-endpoint',
    example: {
      mandatoryString: 'hello-world'
    }
  },
  scenarios: [
    {
      name: 'test scenario',
      engine: 'example',
      flow: [
        {
          doSomething: {
            id: 123
          }
        }
      ]
    }
  ]
};

test('Engine interface', async (t) => {
  const events = new EventEmitter();
  const engine = new ExampleEngine(script, events, {});
  const scenario = engine.createScenario(script.scenarios[0], events);

  t.match(engine.script, script, 'Engine constructor sets script');
  t.type(scenario, 'function', 'Engine.createScenario returns a function');
});
