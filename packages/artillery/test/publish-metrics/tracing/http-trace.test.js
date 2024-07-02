const { test, afterEach, beforeEach } = require('tap');
const { $ } = require('zx');
const fs = require('fs');
const { generateTmpReportPath, deleteFile } = require('../../helpers');

const { setDynamicHTTPTraceExpectations } = require('../fixtures/helpers.js');

const { runHttpTraceAssertions } = require('./http-trace-assertions.js');

beforeEach(async (t) => {
  t.context.reportFilePath = generateTmpReportPath(t.name, 'json');
  t.context.tracesFilePath = generateTmpReportPath('spans_' + t.name, 'json');
});

afterEach(async (t) => {
  deleteFile(t.context.reportFilePath);
  deleteFile(t.context.tracesFilePath);
});

/* To write a test for the publish-metrics http tracing you need to:
    1. Define the test configuration through the override object
    2. Define the expected outcome values in the expectedOutcome object (see the required properties in the runHttptTraceAssertions function in the http-trace-assertions.js file)
    3. Run the test
    5. Assemble all test run data into one object for assertions (output of the test run, artillery report summary and exported spans)
    6. Run assertions with `runHttpTraceAssertions`  

  NOTE: Any changes or features that influence the trace format or require additional checks 
  should be added to the `runHttpTraceAssertions` function
*/

test('OTel reporter correctly records trace data for http engine test runs', async (t) => {
  // Define test configuration
  const override = {
    config: {
      plugins: {
        'publish-metrics': [
          {
            type: 'open-telemetry',
            traces: {
              exporter: '__test',
              __outputPath: t.context.tracesFilePath,
              useRequestNames: true,
              replaceSpanNameRegex: [{ pattern: 'armadillo', as: 'bombolini' }],
              attributes: {
                environment: 'test',
                tool: 'Artillery'
              }
            }
          }
        ]
      }
    }
  };

  // Define the expected outcome
  const expectedOutcome = {
    scenarioName: 'trace-http-test',
    exitCode: 0,
    vus: 4,
    reqPerVu: 3,
    reqSpansPerVu: 3,
    vusFailed: 0,
    errors: 0,
    spansWithErrorStatus: 0,
    userSetAttributes:
      override.config.plugins['publish-metrics'][0].traces.attributes,
    spanNamesByReqName: ['dino', 'bombolini'],
    spanNamesByMethod: ['get'],
    spanNamesReplaced: ['bombolini']
  };

  // Setting expected values calculated from the base values
  setDynamicHTTPTraceExpectations(expectedOutcome);

  /// Run the test
  let output;
  try {
    output = await $`artillery run ${__dirname}/../fixtures/http-trace.yml -o ${
      t.context.reportFilePath
    } --overrides ${JSON.stringify(override)}`;
  } catch (err) {
    console.error('There has been an error in test run execution: ', err);
    t.fail(err);
  }

  // Get all main test run data
  const testRunData = {
    output,
    reportSummary: JSON.parse(fs.readFileSync(t.context.reportFilePath, 'utf8'))
      .aggregate,
    spans: JSON.parse(fs.readFileSync(t.context.tracesFilePath, 'utf8'))
  };

  // Run assertions
  try {
    await runHttpTraceAssertions(t, testRunData, expectedOutcome);
  } catch (err) {
    console.error(err);
  }
});

test('OTel reporter works appropriately with "parallel" scenario setting ', async (t) => {
  // Define test configuration
  const override = {
    config: {
      plugins: {
        'publish-metrics': [
          {
            type: 'open-telemetry',
            traces: {
              exporter: '__test',
              __outputPath: t.context.tracesFilePath,
              useRequestNames: true,
              replaceSpanNameRegex: [{ pattern: 'armadillo', as: 'bombolini' }],
              attributes: {
                environment: 'test',
                tool: 'Artillery'
              }
            }
          }
        ]
      }
    },
    scenarios: [
      {
        name: 'trace-http-test',
        flow: [
          {
            parallel: [
              { get: { url: '/dino', name: 'dino' } },
              { get: { url: '/pony' } },
              { get: { url: '/armadillo', name: 'armadillo' } }
            ]
          }
        ]
      }
    ]
  };

  // Define the expected outcome
  const expectedOutcome = {
    scenarioName: 'trace-http-test',
    exitCode: 0,
    vus: 4,
    reqPerVu: 3,
    reqSpansPerVu: 3,
    vusFailed: 0,
    errors: 0,
    spansWithErrorStatus: 0,
    userSetAttributes:
      override.config.plugins['publish-metrics'][0].traces.attributes,
    spanNamesByReqName: ['dino', 'bombolini'],
    spanNamesByMethod: ['get'],
    spanNamesReplaced: ['bombolini']
  };

  // Setting expected values calculated from the base values
  setDynamicHTTPTraceExpectations(expectedOutcome);

  /// Run the test
  let output;
  try {
    output = await $`artillery run ${__dirname}/../fixtures/http-trace.yml -o ${
      t.context.reportFilePath
    } --overrides ${JSON.stringify(override)}`;
  } catch (err) {
    t.fail(err);
  }

  // Get all main test run data
  const testRunData = {
    output,
    reportSummary: JSON.parse(fs.readFileSync(t.context.reportFilePath, 'utf8'))
      .aggregate,
    spans: JSON.parse(fs.readFileSync(t.context.tracesFilePath, 'utf8'))
  };

  // Run assertions
  try {
    await runHttpTraceAssertions(t, testRunData, expectedOutcome);
  } catch (err) {
    console.error(err);
  }
});

test('Otel reporter appropriately records traces for test runs with errors', async (t) => {
  // Define test configuration
  const override = {
    config: {
      plugins: {
        'publish-metrics': [
          {
            type: 'open-telemetry',
            traces: {
              exporter: '__test',
              __outputPath: t.context.tracesFilePath,
              useRequestNames: true,
              replaceSpanNameRegex: [{ pattern: 'armadillo', as: 'bombolini' }],
              attributes: {
                environment: 'test',
                tool: 'Artillery'
              }
            }
          }
        ]
      }
    },
    scenarios: [
      {
        name: 'trace-http-test',
        flow: [
          {
            parallel: [
              { get: { url: '/dino', name: 'dino' } },
              { get: { url: '/armadillo', name: 'armadillo' } },
              { get: { url: '/pony', body: { json: 'This will fail' } } }
            ]
          }
        ]
      }
    ]
  };

  // Define the expected outcome
  const expectedOutcome = {
    scenarioName: 'trace-http-test',
    exitCode: 0,
    vus: 4,
    reqPerVu: 2,
    reqSpansPerVu: 3,
    reqSpansWithErrorPerVu: 1,
    vusFailed: 4,
    errors: 4,
    spansWithErrorStatus: 4,
    userSetAttributes:
      override.config.plugins['publish-metrics'][0].traces.attributes,
    spanNamesByReqName: ['dino', 'bombolini'],
    spanNamesByMethod: ['get'],
    spanNamesReplaced: ['bombolini']
  };

  // Setting expected values calculated from the base values
  setDynamicHTTPTraceExpectations(expectedOutcome);

  /// Run the test
  let output;
  try {
    output = await $`artillery run ${__dirname}/../fixtures/http-trace.yml -o ${
      t.context.reportFilePath
    } --overrides ${JSON.stringify(override)}`;
  } catch (err) {
    t.fail(err);
  }

  // Get all main test run data
  const testRunData = {
    output,
    reportSummary: JSON.parse(fs.readFileSync(t.context.reportFilePath, 'utf8'))
      .aggregate,
    spans: JSON.parse(fs.readFileSync(t.context.tracesFilePath, 'utf8'))
  };

  // Run assertions
  try {
    await runHttpTraceAssertions(t, testRunData, expectedOutcome);
  } catch (err) {
    console.error(err);
  }
});
