const { test } = require('tap');
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

test('validate script', (t) => {
  t.plan(10);

  t.equal(
    validateScript(baseScript),
    undefined,
    'it should return undefined for a valid script'
  );

  t.test('config.target', (t) => {
    const scriptWithNoConfig = lodash.cloneDeep(baseScript);
    delete scriptWithNoConfig.config.target;

    t.equal(
      validateScript(scriptWithNoConfig),
      '"config.target" is required',
      'config.target should be required if config.environments is not defined'
    );

    scriptWithNoConfig.config.environments = {
      local: {
        target: 'http://localhost:3003'
      }
    };

    t.equal(
      validateScript(scriptWithNoConfig),
      undefined,
      'it should validate the script if config.environments is defined but config.target is missing'
    );

    t.end();
  });

  t.test('scenario flow', (t) => {
    const scriptWithNoFlow = lodash.cloneDeep(baseScript);
    delete scriptWithNoFlow.scenarios[0].flow;

    t.equal(
      validateScript(scriptWithNoFlow),
      '"scenarios[0].flow" is required',
      'it should return an error if "scenarios.flow" property is missing'
    );

    t.end();
  });

  t.test('url', (t) => {
    const scriptWithNoUrl = lodash.cloneDeep(baseScript);
    delete scriptWithNoUrl.scenarios[0].flow[1].get.url;

    t.equal(
      validateScript(scriptWithNoUrl),
      '"scenarios[0].flow[1].get.url" is required',
      'it should return an error if "url" property is missing'
    );

    t.end();
  });

  t.test('custom engines', (t) => {
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

    t.equal(
      validateScript(scriptWithCustomEngine),
      undefined,
      'it should not enforce validation for scenarios with custom engines'
    );

    scriptWithCustomEngine.config.engines = {
      myengine: {}
    };

    scriptWithCustomEngine.before = {
      engine: 'myengine'
    };

    t.equal(
      validateScript(scriptWithCustomEngine),
      undefined,
      'it should not require flow for before sections when custom engines are configured'
    );
    delete scriptWithCustomEngine.before;

    scriptWithCustomEngine.after = {
      engine: 'myengine'
    };

    t.equal(
      validateScript(scriptWithCustomEngine),
      undefined,
      'it should not require flow for after sections when custom engines are configured'
    );

    t.end();
  });

  t.test('capture', (t) => {
    const scriptWithCapture = lodash.cloneDeep(baseScript);

    scriptWithCapture.scenarios[0].flow[0].get.capture = {
      json: '$.token',
      as: 'token'
    };
    t.equal(
      validateScript(scriptWithCapture),
      undefined,
      'it should allow capture as object'
    );
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
    t.equal(
      validateScript(scriptWithCapture),
      undefined,
      'it should allow capture as an array of capture objects'
    );

    scriptWithCapture.scenarios[0].flow[0].get.capture = {
      json: '$.token',
      as: 'token'
    };
    delete scriptWithCapture.scenarios[0].flow[0].get.capture.as;

    t.equal(
      validateScript(scriptWithCapture),
      '"scenarios[0].flow[0].get.capture.as" is required',
      'it should return an error if capture.as is missing'
    );

    t.end();
  });

  t.test('before/after sections', (t) => {
    const scriptWithBeforeAfter = lodash.cloneDeep(baseScript);
    scriptWithBeforeAfter.before = { flow: [] };

    t.equal(
      validateScript(scriptWithBeforeAfter),
      undefined,
      'it should validate before sections'
    );

    scriptWithBeforeAfter.before = [
      {
        flow: []
      }
    ];

    t.equal(
      validateScript(scriptWithBeforeAfter),
      '"before" must be of type object',
      'it should fail if before.flow is not an object'
    );
    delete scriptWithBeforeAfter.before;

    scriptWithBeforeAfter.after = [
      {
        flow: []
      }
    ];
    t.equal(
      validateScript(scriptWithBeforeAfter),
      '"after" must be of type object',
      'it should fail if after.flow is not an object'
    );

    t.end();
  });

  t.test('before/after scenario hooks', (t) => {
    const scriptBeforeAfterScenario = lodash.cloneDeep(baseScript);
    scriptBeforeAfterScenario.scenarios[0].beforeScenario = 'beforeScenario';
    scriptBeforeAfterScenario.scenarios[0].afterScenario = 'afterScenario';

    t.equal(
      validateScript(scriptBeforeAfterScenario),
      undefined,
      'it allows before/after scenario hooks as strings'
    );

    scriptBeforeAfterScenario.scenarios[0].beforeScenario = [
      'beforeScenario1',
      'beforeScenario2'
    ];
    scriptBeforeAfterScenario.scenarios[0].afterScenario = [
      'afterScenario1',
      'afterScenario2'
    ];

    t.equal(
      validateScript(scriptBeforeAfterScenario),
      undefined,
      'it allows before/after scenario hooks as arrays of strings'
    );

    scriptBeforeAfterScenario.scenarios[0].beforeScenario = {};

    t.equal(
      validateScript(scriptBeforeAfterScenario),
      '"scenarios[0].beforeScenario" must be a string',
      'it fails if beforeScenario is not a string'
    );

    delete scriptBeforeAfterScenario.scenarios[0].beforeScenario;

    scriptBeforeAfterScenario.scenarios[0].afterScenario = {};

    t.equal(
      validateScript(scriptBeforeAfterScenario),
      '"scenarios[0].afterScenario" must be a string',
      'it fails if afterScenario is not a string'
    );

    t.end();
  });

  t.test('before/after scenario hooks', (t) => {
    const beforeRequestAfterResponse = lodash.cloneDeep(baseScript);

    beforeRequestAfterResponse.scenarios[0].flow[0].get.beforeRequest =
      'beforeRequest';
    beforeRequestAfterResponse.scenarios[0].flow[0].get.afterResponse =
      'afterResponse';
    t.equal(
      validateScript(beforeRequestAfterResponse),
      undefined,
      'it allows before/after request hooks as strings'
    );

    beforeRequestAfterResponse.scenarios[0].flow[0].get.beforeRequest = [
      'beforeRequest1',
      'beforeRequest2'
    ];
    beforeRequestAfterResponse.scenarios[0].flow[0].get.afterResponse = [
      'afterResponse1',
      'afterResponse2'
    ];

    t.equal(
      validateScript(beforeRequestAfterResponse),
      undefined,
      'it allows before/after request hooks as arrays of strings'
    );
    beforeRequestAfterResponse.scenarios[0].flow[0].get.beforeRequest = {};

    t.equal(
      validateScript(beforeRequestAfterResponse),
      '"scenarios[0].flow[0].get.beforeRequest" must be a string',
      'it fails if beforeRequest is not a string'
    );

    delete beforeRequestAfterResponse.scenarios[0].flow[0].get.beforeRequest;
    beforeRequestAfterResponse.scenarios[0].flow[0].get.afterResponse = {};
    t.equal(
      validateScript(beforeRequestAfterResponse),
      '"scenarios[0].flow[0].get.afterResponse" must be a string',
      'it fails if afterResponse is not a string'
    );

    t.end();
  });

  t.test('socketio', (t) => {
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

    t.equal(
      validateScript(scriptSocketio),
      undefined,
      'it should validate a socketio flow'
    );

    scriptSocketio.scenarios[0].flow = [
      {
        emit: {
          channel: [],
          data: 123
        }
      }
    ];

    t.equal(
      validateScript(scriptSocketio),
      '"scenarios[0].flow[0].emit.channel" must be a string',
      'it should fail validation if engine is socketio and emit.channel is not a string'
    );

    t.end();
  });

  t.end();
});
