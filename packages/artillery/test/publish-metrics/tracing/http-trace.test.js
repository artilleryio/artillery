const { test, afterEach, beforeEach } = require('tap');
const { $ } = require('zx');
const fs = require('fs');
const { generateTmpReportPath, deleteFile } = require('../../cli/_helpers.js');

const {
  getTestId,
  setDynamicHTTPTraceExpectations
} = require('../fixtures/helpers.js');

const { runHttpTraceAssertions } = require('./http-trace-assertions.js');

let reportFilePath;
let tracesFilePath;
beforeEach(async (t) => {
  reportFilePath = generateTmpReportPath(t.name, 'json');
  tracesFilePath = generateTmpReportPath('spans_' + t.name, 'json');
});

afterEach(async (t) => {
  deleteFile(reportFilePath);
  deleteFile(tracesFilePath);
});

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
              __outputPath: tracesFilePath,
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
    timePhaseSpansPerReqSpan: 5,
    vusFailed: 0,
    errors: 0,
    spansWithErrorStatus: 0,
    userSetAttributes:
      override.config.plugins['publish-metrics'][0].traces.attributes
  };

  // Setting expected values calculated from the base values
  setDynamicHTTPTraceExpectations(expectedOutcome);

  /// Run the test
  let output;
  try {
    output =
      await $`artillery run ${__dirname}/../fixtures/http-trace.yml -o ${reportFilePath} --overrides ${JSON.stringify(
        override
      )}`;
  } catch (err) {
    t.fail(err);
  }

  // Get all main test run data
  const testRunData = {
    output,
    reportSummary: JSON.parse(fs.readFileSync(reportFilePath, 'utf8'))
      .aggregate,
    spans: JSON.parse(fs.readFileSync(tracesFilePath, 'utf8'))
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
              __outputPath: tracesFilePath,
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
    timePhaseSpansPerReqSpan: 5,
    vusFailed: 0,
    errors: 0,
    spansWithErrorStatus: 0,
    userSetAttributes:
      override.config.plugins['publish-metrics'][0].traces.attributes
  };

  // Setting expected values calculated from the base values
  setDynamicHTTPTraceExpectations(expectedOutcome);

  /// Run the test
  let output;
  try {
    output =
      await $`artillery run ${__dirname}/../fixtures/http-trace.yml -o ${reportFilePath} --overrides ${JSON.stringify(
        override
      )}`;
  } catch (err) {
    t.fail(err);
  }

  // Get all main test run data
  const testRunData = {
    testId: getTestId(output.stdout),
    reportSummary: JSON.parse(fs.readFileSync(reportFilePath, 'utf8'))
      .aggregate,
    spans: JSON.parse(fs.readFileSync(tracesFilePath, 'utf8'))
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
              __outputPath: tracesFilePath,
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
    timePhaseSpansPerReqSpan: 5,
    timePhaseSpansPerReqSpanWithError: 0,
    vusFailed: 4,
    errors: 4,
    spansWithErrorStatus: 4,
    userSetAttributes:
      override.config.plugins['publish-metrics'][0].traces.attributes
  };

  // Setting expected values calculated from the base values
  setDynamicHTTPTraceExpectations(expectedOutcome);

  /// Run the test
  let output;
  try {
    output =
      await $`artillery run ${__dirname}/../fixtures/http-trace.yml -o ${reportFilePath} --overrides ${JSON.stringify(
        override
      )}`;
  } catch (err) {
    t.fail(err);
  }

  // Get all main test run data
  const testRunData = {
    output,
    reportSummary: JSON.parse(fs.readFileSync(reportFilePath, 'utf8'))
      .aggregate,
    spans: JSON.parse(fs.readFileSync(tracesFilePath, 'utf8'))
  };

  // Run assertions
  try {
    await runHttpTraceAssertions(t, testRunData, expectedOutcome);
  } catch (err) {
    console.error(err);
  }
});
