const { test, afterEach, beforeEach } = require('tap');
const { $ } = require('zx');
const fs = require('fs');
const {
  generateTmpReportPath,
  deleteFile,
  getTestId
} = require('../_helpers.js');

let expectedExitCode;
let expectedVus;
let expectedRequestsPerVu;
let expectedReqSpansPerVu;
let expectedTimePhaseSpansPerReqSpan;
let userSetAttributes;
let scenarioName = 'trace-http-test';
let timePhaseSpanNames = [
  'dns_lookup',
  'tcp_handshake',
  'request',
  'download',
  'first_byte'
]; // There is also 'tls_negotiation' but it will not be present in the spans as the test does not make https requests

// Error specific expectations
let expectedVusFailed = 0;
let expectedErrors = 0;
let expectedSpansWithErrorStatus = 0;
let expectedReqSpansWithError = 0;
let expectedReqSpansWithErrorPerVu = 0;
let expectedTimePhaseSpansPerReqSpanWithError = 0;

// Dynamically set expectations based on the above
let expectedReqWithoutErrorPerVu;
let expectedSpansPerVu;
let expectedReqSpans;
let expectedTotalSpans;

let reportFilePath;
let tracesFilePath;
beforeEach(async (t) => {
  reportFilePath = generateTmpReportPath(t.name, 'json');
  tracesFilePath = generateTmpReportPath('spans_' + t.name, 'json');
});

afterEach(async (t) => {
  deleteFile(reportFilePath);
  // deleteFile(tracesFilePath);
});

test('OTel reporter correctly records trace data for http engine test runs', async (t) => {
  // Arrange
  expectedExitCode = 0;
  expectedVus = 4;
  expectedRequestsPerVu = 3;
  expectedReqSpansPerVu = expectedRequestsPerVu;

  expectedTimePhaseSpansPerReqSpan = 5;
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
  expectedExitCode = 0;
  expectedVus = 4;
  expectedRequestsPerVu = 3;
  expectedReqSpansPerVu = expectedRequestsPerVu;
  expectedTimePhaseSpansPerReqSpan = 5;
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

test('Otel reporter appropriately records traces for test runs with errors', async (t) => {
  expectedExitCode = 0;
  expectedVus = 4;
  expectedRequestsPerVu = 2;
  expectedReqSpansPerVu = 3;
  expectedReqSpansWithErrorPerVu = 1;
  expectedTimePhaseSpansPerReqSpan = 5;
  expectedTimePhaseSpansPerReqSpanWithError = 0;
  expectedVusFailed = expectedVus;
  expectedErrors = expectedVus;
  expectedSpansWithErrorStatus = expectedVus;

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
        name: scenarioName,
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

  userSetAttributes =
    override.config.plugins['publish-metrics'][0].traces.attributes;
  try {
    await runHttpTest(t, override);
  } catch (err) {
    console.error(err);
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
  const timingPhaseSpans = spans.filter(
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
  t.equal(
    spans.length,
    expectedTotalSpans,
    `There should be ${expectedTotalSpans} spans created in total`
  );

  // Errors and failed VUs
  t.equal(
    output.exitCode,
    expectedExitCode,
    `CLI Exit Code should be ${expectedExitCode}`
  );
  t.equal(
    reportSummary.counters['vusers.failed'],
    expectedVusFailed,
    `${expectedVusFailed} VUs should have failed`
  );

  const errorsReported = Object.keys(reportSummary.counters).filter(
    (metricName) => metricName.startsWith('errors.')
  );
  const numErrorsReported = errorsReported.reduce(
    (acc, metricName) => acc + reportSummary.counters[metricName],
    0
  );
  t.equal(
    numErrorsReported,
    expectedErrors,
    `There should be ${expectedErrors} errors reported`
  );
  t.equal(
    spans.filter((span) => span.events[0]?.name === 'exception').length,
    expectedErrors,
    'Num of errors in report should match the num of spans with error exception'
  ); // In http engine the only event we record is the error exception event so we can just check that event is present

  // We check the error span status separately from errors as it can be set to error even when no error is recorded, e.g. when http status code is 404 or over
  t.equal(
    spans.filter((span) => span.status.code === 2).length,
    expectedSpansWithErrorStatus,
    `${expectedSpansWithErrorStatus} spans should have the 'error' status`
  );

  if (expectedErrors) {
    t.equal(
      spans.filter(
        (span) => span.events[0]?.name === 'exception' && span.status.code === 2
      ).length,
      expectedErrors,
      'Errors should be recorded on spans as an event and status code'
    );
    t.equal(
      requestSpans.filter((span) => span.events[0]?.name === 'exception')
        .length,
      expectedReqSpansWithError,
      `${expectedReqSpansWithError} request spans should have the error exception recorded`
    );
    spans
      .filter((span) => span.events[0]?.name === 'exception')
      .forEach((span) => {
        t.hasProps(
          span.events[0].attributes,
          ['exception.type', 'exception.message', 'exception.stacktrace'],
          'Every error event recorded should have the error type, message and stacktrace recorded'
        );
      });
  }

  // Request level spans
  t.equal(
    reportSummary.counters['http.requests'],
    expectedRequestsPerVu * expectedVus,
    `${expectedRequestsPerVu * expectedVus} requests should have been made`
  );

  // If an error happens when trying to make a request (after before request hook) resulting in request not being made, we will still have the request span for it with the error recorded on the span
  // So the number of request spans will not be equal to the number of requests made
  if (!expectedErrors) {
    t.equal(
      requestSpans.length,
      reportSummary.counters['http.requests'],
      'The number of request spans should match the number of requests made'
    );
  }

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
        expectedReqSpansPerVu,
        `Each trace should have ${expectedReqSpansPerVu} request spans`
      );
    });

  requestSpans.forEach((span) => {
    const siblingTimingPhaseSpans = timingPhaseSpans.filter(
      (timingSpan) => timingSpan.parentId === span.id
    );
    const hasError = span.events[0]?.name === 'exception';
    const expectedCount = hasError
      ? expectedTimePhaseSpansPerReqSpanWithError
      : expectedTimePhaseSpansPerReqSpan;
    t.equal(
      siblingTimingPhaseSpans.length,
      expectedCount,
      `Request spans ${
        hasError ? 'with error' : ''
      } should have ${expectedCount} child timing phase spans`
    );
    const names = timePhaseSpanNames.slice();
    if (!hasError) {
      siblingTimingPhaseSpans
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
    }
  });

  // Span names
  t.equal(
    scenarioSpans[0].name,
    scenarioName,
    'The scenario span should have the name of the scenario when set'
  );

  // Curently this file always assumes 3 req per scenario one with name dino, one without a name and one with name armadillo that is replaced with bombolini by using the replaceSpanNameRegex setting
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
  if (!expectedErrors) {
    expectedSpansPerVu =
      1 +
      expectedReqSpansPerVu +
      expectedReqSpansPerVu * expectedTimePhaseSpansPerReqSpan; // 1 represents the root scenario/VU span
  } else {
    // If there are errors, the number of spans could be lower than expected - request spans with error might not have all the timing phase spans
    const expectedReqSpansWithoutErrorPerVu =
      expectedReqSpansPerVu - expectedReqSpansWithErrorPerVu;
    expectedSpansPerVu =
      1 +
      expectedReqSpansPerVu +
      expectedReqSpansWithoutErrorPerVu * expectedTimePhaseSpansPerReqSpan +
      expectedReqSpansWithErrorPerVu *
        expectedTimePhaseSpansPerReqSpanWithError;
    expectedReqSpansWithError = expectedReqSpansWithErrorPerVu * expectedVus;
  }
  expectedReqSpans = expectedVus * expectedReqSpansPerVu;
  expectedTotalSpans = expectedVus * expectedSpansPerVu;
}
