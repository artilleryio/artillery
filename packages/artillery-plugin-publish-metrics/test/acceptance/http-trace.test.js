const { test, afterEach, beforeEach } = require('tap');
const { $ } = require('zx');
const fs = require('fs');
const {
  generateTmpReportPath,
  deleteFile,
  getTestId
} = require('../_helpers.js');

let expectedVus;
let expectedRequestsPerVu;
let expectedTimePhaseSpansPerRequest;
let expectedVusFailed;
let expectedErrors;
let expectedSpansWithErrorStatus;
let userSetAttributes;

let expectedSpansPerVu;
let expectedRequests;
let expectedTotalSpans;
let scenarioName = 'trace-http-test';
let timePhaseSpanNames = [
  'dns_lookup',
  'tcp_handshake',
  'request',
  'download',
  'first_byte'
]; // There is also 'tls_negotiation' but it will not be present in the spans as the test does not make https requests

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
  // Arrange
  expectedVus = 4;
  expectedRequestsPerVu = 3;
  expectedTimePhaseSpansPerRequest = 5;
  expectedVusFailed = 0;
  expectedErrors = 0;
  expectedSpansWithErrorStatus = 0;

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
  userSetAttributes =
    override.config.plugins['publish-metrics'][0].traces.attributes;

  try {
    await runHttpTest(t, override);
  } catch (err) {
    console.error(err);
    t.fail(err);
  }
});

test('OTel reporter works appropriately with "parallel" scenario setting ', async (t) => {
  (expectedVus = 2),
    (expectedRequestsPerVu = 3),
    (expectedTimePhaseSpansPerRequest = 5),
    (expectedVusFailed = 0),
    (expectedErrors = 0),
    (expectedSpansWithErrorStatus = 0);

  const override = {
    config: {
      phases: [{ duration: 2, arrivalRate: 1 }],
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
        name: scenarioName,
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

  userSetAttributes =
    override.config.plugins['publish-metrics'][0].traces.attributes;
  try {
    await runHttpTest(t, override);
  } catch (err) {
    console.error(err);
    t.fail(err);
  }
});

async function runHttpTest(t, override) {
  setDynamicHTTPTraceExpectations();

  /// Run the test
  let output;
  try {
    output =
      await $`../artillery/bin/run run ./test/fixtures/http-trace.yml -o ${reportFilePath} --overrides ${JSON.stringify(
        override
      )}`;
  } catch (err) {
    t.fail(err);
  }

  const testId = getTestId(output.stdout);
  const reportSummary = JSON.parse(
    fs.readFileSync(reportFilePath, 'utf8')
  ).aggregate;

  const spans = JSON.parse(fs.readFileSync(tracesFilePath, 'utf8'));
  const requestSpans = spans.filter((span) => span.attributes['http.method']);
  const timingSpans = spans.filter(
    (span) => !span.attributes['http.method'] && span.parentId
  );
  const scenarioSpans = spans.filter((span) => !span.parentId);

  // Created VUs/traces
  t.equal(
    reportSummary.counters['vusers.created'],
    expectedVus,
    `${expectedVus} VUs should have been created`
  );
  t.equal(
    reportSummary.counters['vusers.created'],
    scenarioSpans.length,
    'The number of scenario spans should match the number of VUs created'
  );

  // Errors and failed VUs
  t.equal(output.exitCode, 0, 'CLI Exit Code should be 0');
  t.equal(
    reportSummary.counters['vusers.failed'],
    expectedVusFailed,
    'No VUs should have failed'
  );
  t.equal(
    spans.filter((span) => span.status.code === 2).length,
    expectedVusFailed,
    'There should be no errors recorded on the spans'
  );
  t.equal(
    spans.length,
    expectedTotalSpans,
    `There should be ${expectedTotalSpans} spans created in total`
  );

  t.equal(output.exitCode, 0, 'CLI Exit Code should be 0');
  t.equal(
    reportSummary.counters['vusers.failed'],
    expectedVusFailed,
    'No VUs should have failed'
  );

  t.equal(
    Object.keys(reportSummary.counters).filter((metricName) =>
      metricName.startsWith('errors.')
    ).length,
    expectedErrors,
    `There should be ${expectedErrors} errors recorded`
  );

  // Span status can be set to error even when no error is recorded, e.g. when http status code is 404 or over
  t.equal(
    spans.filter((span) => span.status.code === 2).length,
    expectedSpansWithErrorStatus,
    `${expectedSpansWithErrorStatus} spans should have the 'error' status`
  );

  // Request level spans
  t.equal(
    reportSummary.counters['http.requests'],
    expectedRequests,
    `${expectedRequests} requests should have been made`
  );
  t.equal(
    requestSpans.length,
    reportSummary.counters['http.requests'],
    'The number of request spans should match the number of requests made'
  );

  Object.keys(reportSummary.counters)
    .filter((counter) => {
      counter.startsWith('http.codes.');
    })
    .forEach((metric) => {
      const statusCode = metric.split('.')[2];
      t.equal(
        requestSpans.filter(
          (span) => span.attributes['http.status_code'] === statusCode
        ).length,
        reportSummary.counters[metric],
        `The number of spans with status code ${statusCode} should match the number of requests with that status code`
      );
    });

  // Proper nesting
  scenarioSpans
    .map((span) => span.id)
    .forEach((id) => {
      const siblingRequestSpans = requestSpans.filter(
        (requestSpan) => requestSpan.parentId === id
      );
      t.equal(
        siblingRequestSpans.length,
        expectedRequestsPerVu,
        `Each trace should have ${expectedRequestsPerVu} request spans`
      );
    });

  requestSpans
    .map((span) => span.id)
    .forEach((id) => {
      const siblingTimingSpans = timingSpans.filter(
        (timingSpan) => timingSpan.parentId === id
      );
      t.equal(
        siblingTimingSpans.length,
        expectedTimePhaseSpansPerRequest,
        `Each request should have ${expectedTimePhaseSpansPerRequest} child timing phase spans`
      );
      const names = timePhaseSpanNames.slice();
      siblingTimingSpans
        .map((span) => span.name)
        .forEach((name) => {
          if (names.includes(name)) {
            t.pass(
              'Correct child timing phase spans should be recorded for each request span'
            );
            names.splice(names.indexOf(name), 1);
          } else {
            t.fail(`Unexpected timing phase span: ${name}`);
          }
        });
    });

  // Span names
  t.equal(
    scenarioSpans[0].name,
    scenarioName,
    'The scenario span should have the name of the scenario when set'
  );

  // Curently this file always runs 3 req per scenario one with name dino, one without a name and one with name armadillo that is replaced with bombolini by using the replaceSpanNameRegex setting
  // TODO Dynamically set the expected number of spans with a certain name or without a name
  t.equal(
    requestSpans.filter((span) => span.name === 'dino').length,
    requestSpans.length / 3,
    'When useRequestNames is set to true, the request span should have the name of the request if the name is set'
  );
  t.equal(
    requestSpans.filter((span) => span.name === 'bombolini').length,
    requestSpans.length / 3,
    'replaceSpanNameRegex appropriately replaces the pattern in span name'
  );
  t.equal(
    requestSpans.filter(
      (span) => span.name === span.attributes['http.method'].toLowerCase()
    ).length,
    requestSpans.length / 3,
    'When useRequestNames is set to true, if no request name is provided,the request span will be named by the request method'
  );

  // Attributes
  t.equal(
    spans.filter((span) => span.attributes['test_id']).length,
    spans.length,
    'All spans should have the test_id attribute'
  );
  t.equal(
    spans.filter((span) => span.attributes['test_id'] === testId).length,
    spans.length,
    'All spans should have the correct test_id attribute value'
  );
  t.equal(
    spans.filter((span) => span.attributes['vu.uuid']).length,
    spans.length,
    'All spans should have the vu.uuid attribute'
  );

  Object.keys(userSetAttributes).forEach((attr) => {
    t.equal(
      requestSpans.filter((span) => span.attributes[attr]).length,
      requestSpans.length,
      'All request should have the user set attributes'
    );
    t.equal(
      requestSpans.filter(
        (span) => span.attributes[attr] === userSetAttributes[attr]
      ).length,
      requestSpans.length,
      'Correct values should be set for all user provided attributes'
    );
  });
}

function setDynamicHTTPTraceExpectations() {
  expectedSpansPerVu =
    1 +
    expectedRequestsPerVu +
    expectedRequestsPerVu * expectedTimePhaseSpansPerRequest; // 1 represents the root scenario/VU span
  expectedRequests = expectedVus * expectedRequestsPerVu;
  expectedTotalSpans = expectedVus * expectedSpansPerVu;
}
