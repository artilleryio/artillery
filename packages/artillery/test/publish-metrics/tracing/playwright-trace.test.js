const { test, afterEach, beforeEach } = require('tap');
const { $ } = require('zx');
const fs = require('fs');
const { generateTmpReportPath, deleteFile } = require('../../helpers');

const {
  setDynamicPlaywrightTraceExpectations
} = require('../fixtures/helpers.js');

const {
  runPlaywrightTraceAssertions
} = require('./playwright-trace-assertions.js');

beforeEach(async (t) => {
  t.context.reportFilePath = generateTmpReportPath(t.name, 'json');
  t.context.tracesFilePath = generateTmpReportPath('spans_' + t.name, 'json');
});

afterEach(async (t) => {
  deleteFile(t.context.reportFilePath);
  deleteFile(t.context.tracesFilePath);
});

/* To write a test for the publish-metrics tracing you need to:
    1. Define the test configuration through the override object
    2. Define the expected outcome values in the expectedOutcome object (see the required properties in the runPlaywrightTraceAssertions function in the playwright-trace-assertions.js file)
    3. Run the test
    5. Assemble all test run data into one object for assertions (output of the test run, artillery report summary and exported spans)
    6. Run assertions with `runPlaywrightTraceAssertions`  

  NOTE: Any changes or features that influence the trace format or require additional checks 
  should be added to the `runPlaywrightTraceAssertions` function
*/

test('OTel reporter correctly records trace data for playwright engine test runs', async (t) => {
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
              replaceSpanNameRegex: [
                {
                  pattern:
                    'https://www.artillery.io/docs/get-started/core-concepts',
                  as: 'core_concepts'
                },
                { pattern: 'https://www.artillery.io/docs', as: 'docs_main' },
                { pattern: 'Go to core concepts', as: 'bombolini' }
              ],
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
    scenarioName: 'trace-playwright-test',
    exitCode: 0,
    vus: 4,
    vusFailed: 0,
    errors: 0,
    spansWithErrorStatus: 0,
    pageSpansPerVu: 3,
    stepSpansPerVu: 3,
    userSetAttributes:
      override.config.plugins['publish-metrics'][0].traces.attributes,
    stepNames: ['Go to Artillery', 'Go to docs', 'bombolini'],
    pageSpanNames: [
      'Page: https://www.artillery.io/',
      'Page: docs_main',
      'Page: core_concepts'
    ],
    pagesVisitedPerVU: [
      'https://www.artillery.io/',
      'https://www.artillery.io/docs',
      'https://www.artillery.io/docs/get-started/core-concepts'
    ],
    modifiedSpanNames: {
      steps: ['bombolini'],
      pages: ['Page: docs_main', 'Page: core_concepts']
    }
  };

  setDynamicPlaywrightTraceExpectations(expectedOutcome);

  // Run the test
  let output;
  try {
    output =
      await $`artillery run ${__dirname}/../fixtures/playwright-trace.yml -o ${
        t.context.reportFilePath
      } --overrides ${JSON.stringify(override)}`;
  } catch (err) {
    t.fail(err);
  }

  // Assemble all test run data into one object for assertions (output of the test run, artillery report summary and exported spans)
  const testRunData = {
    output,
    reportSummary: JSON.parse(fs.readFileSync(t.context.reportFilePath, 'utf8'))
      .aggregate,
    spans: JSON.parse(fs.readFileSync(t.context.tracesFilePath, 'utf8'))
  };

  // Run assertions
  try {
    await runPlaywrightTraceAssertions(t, testRunData, expectedOutcome);
  } catch (err) {
    console.error(err);
    t.fail(err);
  }
});

test('OTel reporter correctly records trace data for playwright engine test runs with errors', async (t) => {
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
              replaceSpanNameRegex: [
                { pattern: 'https://www.artillery.io/docs', as: 'docs_main' },
                { pattern: 'Go to core concepts', as: 'bombolini' }
              ],
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
        name: 'trace-playwright-test',
        engine: 'playwright',
        testFunction: 'simpleError'
      }
    ]
  };

  // Define the expected outcome
  const expectedOutcome = {
    scenarioName: 'trace-playwright-test',
    exitCode: 0,
    vus: 4,
    vusFailed: 4,
    errors: 4,
    spansWithErrorStatus: 4,
    pageSpansPerVu: 2,
    stepSpansPerVu: 3,
    userSetAttributes:
      override.config.plugins['publish-metrics'][0].traces.attributes,
    stepNames: ['Go to Artillery', 'Go to docs', 'bombolini'],
    pageSpanNames: ['Page: https://www.artillery.io/', 'Page: docs_main'],
    pagesVisitedPerVU: [
      'https://www.artillery.io/',
      'https://www.artillery.io/docs'
    ],
    modifiedSpanNames: {
      steps: ['bombolini'],
      pages: ['Page: docs_main']
    }
  };

  setDynamicPlaywrightTraceExpectations(expectedOutcome);

  // Run the test
  let output;
  try {
    output =
      await $`artillery run ${__dirname}/../fixtures/playwright-trace.yml -o ${
        t.context.reportFilePath
      } --overrides ${JSON.stringify(override)}`;
  } catch (err) {
    t.fail(err);
  }

  // Assembling all test run data into one object for assertions (output of the test run, artillery report summary and exported spans)
  const testRunData = {
    output,
    reportSummary: JSON.parse(fs.readFileSync(t.context.reportFilePath, 'utf8'))
      .aggregate,
    spans: JSON.parse(fs.readFileSync(t.context.tracesFilePath, 'utf8'))
  };

  // Run assertions
  try {
    await runPlaywrightTraceAssertions(t, testRunData, expectedOutcome);
  } catch (err) {
    console.error(err);
    t.fail(err);
  }
});
