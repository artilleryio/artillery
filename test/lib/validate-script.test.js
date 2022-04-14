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
        },
        { delete: { url: '/protected' } }
      ]
    }
  ]
};

test('validate script', (t) => {
  t.equal(
    validateScript(baseScript),
    undefined,
    'it should return undefined for a valid script'
  );

  t.equal(
    validateScript({
      ...baseScript,
      ...{ config: { ...baseScript.config, target: undefined } }
    }),
    '"config.target" is required',
    'it should return an error if config.target is missing'
  );

  const scriptWithNoFlow = lodash.cloneDeep(baseScript);
  delete scriptWithNoFlow.scenarios[0].flow;
  t.equal(
    validateScript(scriptWithNoFlow),
    '"scenarios[0].flow" is required',
    'it should return an error if "scenarios.flow" property is missing'
  );

  const scriptWithNoUrl = lodash.cloneDeep(baseScript);
  delete scriptWithNoUrl.scenarios[0].flow[1].get.url;
  t.equal(
    validateScript(scriptWithNoUrl),
    '"scenarios[0].flow[1].get.url" is required',
    'it should return an error if "url" property is missing'
  );

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
