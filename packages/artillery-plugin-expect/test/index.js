'use strict';

import test from 'ava';
import createDebug from 'debug';
const debug = createDebug('expect-plugin:test');
import EventEmitter from 'events';

//
// We only need this when running unit tests. When the plugin actually runs inside
// a recent version of Artillery, the appropriate object is already set up.
//
global.artillery = {
  util: {
    template: require('artillery/util').template
  }
};

test('Basic interface checks', async t => {
  const script = {
    config: {},
    scenarios: []
  };

  const ExpectationsPlugin = require('../index');
  const events = new EventEmitter();
  const plugin = new ExpectationsPlugin.Plugin(script, events);

  t.true(typeof ExpectationsPlugin.Plugin === 'function');
  t.true(typeof plugin === 'object');

  t.pass();
});

test('Expectation: statusCode', async (t) => {
  const expectations = require('../lib/expectations');

  const data = [
    // expectation - value received - user context - expected result
    [ '{{ expectedStatus }}', 200, { vars: { expectedStatus: 200 }}, true ],
    [ 200, 200, { vars: {}}, true ],
    [ '200', 200, { vars: {}}, true ],
    [ 200, '200', { vars: {}}, true ],
    [ '200', '200', { vars: {}}, true ],

    [ '{{ expectedStatus }}', 200, { vars: { expectedStatus: 202 }}, false ],
    [ '{{ expectedStatus }}', '200', { vars: {}}, false ],
    [ 301, '200', { vars: {}}, false ],
  ];

  data.forEach((e) => {
    const result = expectations.statusCode(
      { statusCode: e[0] }, // expectation
      {}, // body
      {}, // req
      { statusCode: e[1] }, // res
      e[2] // userContext
    );

    t.true(result.ok === e[3]);
  });
});
