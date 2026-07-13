const { test } = require('node:test');
const assert = require('node:assert');
const validateScript = require('../../lib/util/validate-script');
const lodash = require('lodash');

const baseScript = {
  config: {
    target: 'http://127.0.0.1:3003',
    phases: [{ duration: 10, arrivalRate: 1 }],
    variables: {
      password: ['secret']
    }
  },
  scenarios: [
    {
      flow: [
        { get: { url: '/login' } },
        {
          get: {
            url: '/'
          }
        }
      ]
    }
  ]
};

test('validate script', async (t) => {
  /* plan removed: t.plan(10) */;

  assert.strictEqual(validateScript(baseScript), undefined, 'it should return undefined for a valid script');

  await t.test('config.target', (_t, done) => {
    const scriptWithNoConfig = lodash.cloneDeep(baseScript);
    delete scriptWithNoConfig.config.target;

    assert.strictEqual(validateScript(scriptWithNoConfig), '"config.target" is required', 'config.target should be required if config.environments is not defined');

    scriptWithNoConfig.config.environments = {
      local: {
        target: 'http://localhost:3003'
      }
    };

    assert.strictEqual(validateScript(scriptWithNoConfig), undefined, 'it should validate the script if config.environments is defined but config.target is missing');

    done();
  });

  await t.test('scenario flow', (_t, done) => {
    const scriptWithNoFlow = lodash.cloneDeep(baseScript);
    delete scriptWithNoFlow.scenarios[0].flow;

    assert.strictEqual(validateScript(scriptWithNoFlow), '"scenarios[0].flow" is required', 'it should return an error if "scenarios.flow" property is missing');

    done();
  });

  await t.test('url', (_t, done) => {
    const scriptWithNoUrl = lodash.cloneDeep(baseScript);
    delete scriptWithNoUrl.scenarios[0].flow[1].get.url;

    assert.strictEqual(validateScript(scriptWithNoUrl), '"scenarios[0].flow[1].get.url" is required', 'it should return an error if "url" property is missing');

    done();
  });

  await t.test('custom engines', (_t, done) => {
    const scriptWithCustomEngine = lodash.cloneDeep(baseScript);

    scriptWithCustomEngine.scenarios[0] = {
      engine: 'myengine',
      flow: [
        {
          get: {
            url: []
          },
          data: '123'
        }
      ]
    };

    assert.strictEqual(validateScript(scriptWithCustomEngine), undefined, 'it should not enforce validation for scenarios with custom engines');

    scriptWithCustomEngine.config.engines = {
      myengine: {}
    };

    scriptWithCustomEngine.before = {
      engine: 'myengine'
    };

    assert.strictEqual(validateScript(scriptWithCustomEngine), undefined, 'it should not require flow for before sections when custom engines are configured');
    delete scriptWithCustomEngine.before;

    scriptWithCustomEngine.after = {
      engine: 'myengine'
    };

    assert.strictEqual(validateScript(scriptWithCustomEngine), undefined, 'it should not require flow for after sections when custom engines are configured');

    done();
  });

  await t.test('capture', (_t, done) => {
    const scriptWithCapture = lodash.cloneDeep(baseScript);

    scriptWithCapture.scenarios[0].flow[0].get.capture = {
      json: '$.token',
      as: 'token'
    };
    assert.strictEqual(validateScript(scriptWithCapture), undefined, 'it should allow capture as object');
    scriptWithCapture.scenarios[0].flow[0].get.capture = [
      {
        json: '$.token',
        as: 'token'
      },
      {
        json: '$.token1',
        as: 'token1'
      }
    ];
    assert.strictEqual(validateScript(scriptWithCapture), undefined, 'it should allow capture as an array of capture objects');

    scriptWithCapture.scenarios[0].flow[0].get.capture = {
      json: '$.token',
      as: 'token'
    };
    delete scriptWithCapture.scenarios[0].flow[0].get.capture.as;

    assert.strictEqual(validateScript(scriptWithCapture), '"scenarios[0].flow[0].get.capture.as" is required', 'it should return an error if capture.as is missing');

    done();
  });

  await t.test('before/after sections', (_t, done) => {
    const scriptWithBeforeAfter = lodash.cloneDeep(baseScript);
    scriptWithBeforeAfter.before = { flow: [] };

    assert.strictEqual(validateScript(scriptWithBeforeAfter), undefined, 'it should validate before sections');

    scriptWithBeforeAfter.before = [
      {
        flow: []
      }
    ];

    assert.strictEqual(validateScript(scriptWithBeforeAfter), '"before" must be of type object', 'it should fail if before.flow is not an object');
    delete scriptWithBeforeAfter.before;

    scriptWithBeforeAfter.after = [
      {
        flow: []
      }
    ];
    assert.strictEqual(validateScript(scriptWithBeforeAfter), '"after" must be of type object', 'it should fail if after.flow is not an object');

    done();
  });

  await t.test('before/after scenario hooks', (_t, done) => {
    const scriptBeforeAfterScenario = lodash.cloneDeep(baseScript);
    scriptBeforeAfterScenario.scenarios[0].beforeScenario = 'beforeScenario';
    scriptBeforeAfterScenario.scenarios[0].afterScenario = 'afterScenario';

    assert.strictEqual(validateScript(scriptBeforeAfterScenario), undefined, 'it allows before/after scenario hooks as strings');

    scriptBeforeAfterScenario.scenarios[0].beforeScenario = [
      'beforeScenario1',
      'beforeScenario2'
    ];
    scriptBeforeAfterScenario.scenarios[0].afterScenario = [
      'afterScenario1',
      'afterScenario2'
    ];

    assert.strictEqual(validateScript(scriptBeforeAfterScenario), undefined, 'it allows before/after scenario hooks as arrays of strings');

    scriptBeforeAfterScenario.scenarios[0].beforeScenario = {};

    assert.strictEqual(validateScript(scriptBeforeAfterScenario), '"scenarios[0].beforeScenario" must be a string', 'it fails if beforeScenario is not a string');

    delete scriptBeforeAfterScenario.scenarios[0].beforeScenario;

    scriptBeforeAfterScenario.scenarios[0].afterScenario = {};

    assert.strictEqual(validateScript(scriptBeforeAfterScenario), '"scenarios[0].afterScenario" must be a string', 'it fails if afterScenario is not a string');

    done();
  });

  await t.test('before/after scenario hooks', (_t, done) => {
    const beforeRequestAfterResponse = lodash.cloneDeep(baseScript);

    beforeRequestAfterResponse.scenarios[0].flow[0].get.beforeRequest =
      'beforeRequest';
    beforeRequestAfterResponse.scenarios[0].flow[0].get.afterResponse =
      'afterResponse';
    assert.strictEqual(validateScript(beforeRequestAfterResponse), undefined, 'it allows before/after request hooks as strings');

    beforeRequestAfterResponse.scenarios[0].flow[0].get.beforeRequest = [
      'beforeRequest1',
      'beforeRequest2'
    ];
    beforeRequestAfterResponse.scenarios[0].flow[0].get.afterResponse = [
      'afterResponse1',
      'afterResponse2'
    ];

    assert.strictEqual(validateScript(beforeRequestAfterResponse), undefined, 'it allows before/after request hooks as arrays of strings');
    beforeRequestAfterResponse.scenarios[0].flow[0].get.beforeRequest = {};

    assert.strictEqual(validateScript(beforeRequestAfterResponse), '"scenarios[0].flow[0].get.beforeRequest" must be a string', 'it fails if beforeRequest is not a string');

    delete beforeRequestAfterResponse.scenarios[0].flow[0].get.beforeRequest;
    beforeRequestAfterResponse.scenarios[0].flow[0].get.afterResponse = {};
    assert.strictEqual(validateScript(beforeRequestAfterResponse), '"scenarios[0].flow[0].get.afterResponse" must be a string', 'it fails if afterResponse is not a string');

    done();
  });

  await t.test('socketio', (_t, done) => {
    const scriptSocketio = lodash.cloneDeep(baseScript);

    scriptSocketio.scenarios[0].engine = 'socketio';
    scriptSocketio.scenarios[0].flow = [
      {
        emit: {
          channel: 'channel',
          data: 123
        }
      }
    ];

    assert.strictEqual(validateScript(scriptSocketio), undefined, 'it should validate a socketio flow');

    scriptSocketio.scenarios[0].flow = [
      {
        emit: {
          channel: [],
          data: 123
        }
      }
    ];

    assert.strictEqual(validateScript(scriptSocketio), '"scenarios[0].flow[0].emit.channel" must be a string', 'it should fail validation if engine is socketio and emit.channel is not a string');

    done();
  });

});
