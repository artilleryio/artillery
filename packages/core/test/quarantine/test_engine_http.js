//
// Test that HTTP request specs are translated into request objects and then
// executed successfully.
//
// To do that we take a full test script, discard phase config, and run each
// scenario just once.
//

var { test } = require('node:test');
const assert = require('node:assert');
var l = require('lodash');
var nockify = require('./lib/nockify');

let httpWorker;

const __tap = require('node:test');
// Modules under test are ES modules - load before tests run
__tap.before(async () => {
  httpWorker = (await import('../../lib/engine_http.ts')).default;
});
// nockify does not support payloads yet
var scripts = [
  ['hello', require('../scripts/hello.json')],
  ['multiple_phases', require('../scripts/multiple_phases.json')]
];

l.each(scripts, (script) => {
  test(script[0], (t, done) => {
    var server = nockify(script[1].scenarios[0].flow, script[1].config, t);
    var scenario = httpWorker.create(
      script[1].scenarios[0].flow,
      script[1].config,
      {}
    );
    scenario.on('error', (err) => {
      assert.fail(err);
    });
    scenario.launch((err, context) => {
      if (!server.isDone()) {
        console.error('pending mocks: %j', server.pendingMocks());
        assert.fail(new Error());
      }
      server.done();
      assert.ifError(err);
      assert.ok(context, 'context is returned');
      done();
    });
  });
});
