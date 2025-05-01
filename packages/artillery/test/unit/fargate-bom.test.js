'use strict';

const promisify = require('util').promisify;
const path = require('path');
const { test } = require('tap');
const {
  createBOM,
  applyScriptChanges
} = require('../../lib/platform/aws-ecs/legacy/bom');

// TODO: Add tests for other functions in bom.js

test('Self-contained .ts script with no dependencies', async (t) => {
  const inputFilename = 'browser-load-test.ts';
  const inputScript = path.join(
    __dirname,
    '../../../../examples/browser-load-testing-playwright',
    inputFilename
  );
  const createBOMAsync = promisify(createBOM);
  const bom = await createBOMAsync(inputScript, [], {
    scenarioPath: inputScript,
    flags: {}
  });
  console.log(bom);
  t.equal(
    bom.files.length,
    1,
    'Input file is expected to have no dependencies'
  );
  t.equal(bom.files[0].orig.endsWith(inputFilename), true);
  t.equal(
    bom.files[0].noPrefix,
    inputFilename,
    'Unprefixed filename should be the same as the input filename'
  );
});

test('applyScriptChanges should resolve config templates with cli variables', async (t) => {
  // Arrange
  global.artillery.testRunId = 'bombolini_id_1234567890';
  const context = {
    opts: {
      scriptData: {
        config: {
          payload: {
            path: '{{ fakePayloadPath }}'
          },
          plugins: {
            'publish-metrics': [
              {
                type: 'datadog',
                apiKey: '{{ fakeApiKey }}',
                traces: {
                  serviceName: '{{ fakeServiceName }}',
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
          fakeServiceName: 'Bombolini',
          fakePayloadPath: '/path/to/payload.json',
          fakeApiKey: 'my_bombolini_key_1234567890'
        })
      }
    }
  };

  // Act
  applyScriptChanges(context, (err, context) => {
    if (err) {
      return t.fail(err);
    }

    // Assert
    t.equal(
      context.opts.scriptData.config.payload.path,
      '/path/to/payload.json',
      'Should resolve config templates with cli variables'
    );
    t.equal(
      context.opts.scriptData.config.plugins['publish-metrics'][0].apiKey,
      'my_bombolini_key_1234567890',
      'Should resolve config templates with cli variables on all config depth levels'
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
  });
  delete global.artillery.testRunId;
});

test('applyScriptChanges should resolve config templates with env variables', async (t) => {
  // Arrange
  process.env.FAKE_PATH_TO_PAYLOAD = '/path/to/payload.json';
  process.env.FAKE_DD_API_KEY = 'my_bombolini_key_1234567890';
  process.env.FAKE_TEST_ID = 'bombolini_id_1234567890';
  const context = {
    opts: {
      scriptData: {
        config: {
          payload: {
            path: '{{ $env.FAKE_PATH_TO_PAYLOAD }}'
          },
          plugins: {
            'publish-metrics': [
              {
                type: 'datadog',
                apiKey: '{{ $processEnvironment.FAKE_DD_API_KEY }}',
                traces: {
                  serviceName: '{{ $environment.FAKE_SERVICE_NAME }}',
                  attributes: {
                    testId: '{{ $env.FAKE_TEST_ID }}'
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
          FAKE_SERVICE_NAME: 'Bombolini'
        }
      }
    }
  };

  // Act
  applyScriptChanges(context, (err, context) => {
    if (err) {
      t.fail(err);
    }

    //Assert
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
  });

  delete process.env.FAKE_PATH_TO_PAYLOAD;
  delete process.env.FAKE_DD_API_KEY;
  delete process.env.FAKE_TEST_ID;
});
