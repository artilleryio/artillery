'use strict';

const { applyScriptChanges } = require('../../lib/platform/aws-ecs/legacy/bom');

const { test } = require('tap');

test('applyScriptChanges should resolve config templates with cli variables', async (t) => {
  global.artillery.testRunId = 'bombolini_id_1234567890';
  const context = {
    opts: {
      scriptData: {
        config: {
          payload: {
            path: '{{ myPayloadPath }}'
          },
          plugins: {
            'publish-metrics': [
              {
                type: 'datadog',
                apiKey: '{{ myKey }}',
                traces: {
                  serviceName: '{{ name }}',
                  attributes: {
                    testId: '{{ $testId }}'
                  }
                }
              }
            ]
          }
        }
      },
      absoluteScriptPath: '/path/to/script.yml',
      flags: {
        variables: JSON.stringify({
          name: 'Bombolini',
          myPayloadPath: '/path/to/payload.json',
          myKey: 'my_bombolini_key_1234567890'
        })
      }
    }
  };

  const next = (err, context) => {
    if (err) {
      t.fail(err);
    }
    t.equal(
      context.opts.scriptData.config.payload.path,
      '/path/to/payload.json'
    );
    t.equal(
      context.opts.scriptData.config.plugins['publish-metrics'][0].apiKey,
      'my_bombolini_key_1234567890',
      'Should resolve config templates with cli variables'
    );
    t.equal(
      context.opts.scriptData.config.plugins['publish-metrics'][0].traces
        .serviceName,
      'Bombolini',
      'Should resolve config templates with cli variables on all config depth levels'
    );
    t.equal(
      context.opts.scriptData.config.plugins['publish-metrics'][0].traces
        .attributes.testId,
      'bombolini_id_1234567890',
      'Should resolve $testId with global.artillery.testRunId'
    );
  };

  applyScriptChanges(context, next);
  delete global.artillery.testRunId;
});

test('applyScriptChanges should resolve config templates with env variables', async (t) => {
  process.env.BOMBOLINI_PATH_TO_PAYLOAD = '/path/to/payload.json';
  process.env.MY_BOMBOLINI_KEY = 'my_bombolini_key_1234567890';
  process.env.BOMBOLINI_TEST_ID = 'bombolini_id_1234567890';
  const context = {
    opts: {
      scriptData: {
        config: {
          payload: {
            path: '{{ $env.BOMBOLINI_PATH_TO_PAYLOAD }}'
          },
          plugins: {
            'publish-metrics': [
              {
                type: 'datadog',
                apiKey: '{{ $processEnvironment.MY_BOMBOLINI_KEY }}',
                traces: {
                  serviceName: '{{ $environment.BOMBOLINI_NAME }}',
                  attributes: {
                    testId: '{{ $env.BOMBOLINI_TEST_ID }}'
                  }
                }
              }
            ]
          }
        }
      },
      absoluteScriptPath: '/path/to/script.yml',
      flags: {
        environment: {
          BOMBOLINI_NAME: 'Bombolini'
        }
      }
    }
  };

  const next = (err, context) => {
    if (err) {
      t.fail(err);
    }
    t.equal(
      context.opts.scriptData.config.payload.path,
      '/path/to/payload.json',
      'Should resolve $env templates with env vars'
    );
    t.equal(
      context.opts.scriptData.config.plugins['publish-metrics'][0].apiKey,
      'my_bombolini_key_1234567890',
      'Should resolve $processEnvironment templates with env vars'
    );
    t.equal(
      context.opts.scriptData.config.plugins['publish-metrics'][0].traces
        .serviceName,
      'Bombolini',
      'Should resolve $environment templates with vars from flags.environment'
    );
    t.equal(
      context.opts.scriptData.config.plugins['publish-metrics'][0].traces
        .attributes.testId,
      'bombolini_id_1234567890',
      'Should resolve env vars on all levels of test script'
    );
  };

  applyScriptChanges(context, next);

  delete process.env.BOMBOLINI_PATH_TO_PAYLOAD;
  delete process.env.MY_BOMBOLINI_KEY;
  delete process.env.BOMBOLINI_TEST_ID;
});
