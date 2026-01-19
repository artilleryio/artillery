/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { test } = require('tap');
const EventEmitter = require('node:events');

const PosthogEngine = require('..');

const script = {
  config: {
    target: 'my_awesome_posthog',
    posthog: {
      region: 'us-east-1',
      apiKey: '12345'
    }
  },
  scenarios: [
    {
      name: 'capture event',
      engine: 'posthog',
      flow: [
        {
          capture: {
            distinctId: 'distinct id',
            event: 'movie played',
            properties: {
              movieId: 'Die Hard',
              category: 'Christmas'
            }
          }
        }
      ]
    }
  ]
};

test('Engine interface', (t) => {
  const events = new EventEmitter();
  const engine = new PosthogEngine(script, events, {});
  const scenario = engine.createScenario(script.scenarios[0], events);
  t.ok(engine, 'Can construct an engine');
  t.type(scenario, 'function', 'Can create a scenario');
  t.end();
});
