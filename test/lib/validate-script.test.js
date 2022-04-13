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
        { get: { url: '/protected' } }
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

  t.end();
});
