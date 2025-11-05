

const { getTestId } = require('../fixtures/helpers.js');

const requestPhasesAttrs = [
  'dns_lookup.duration',
  'tcp_handshake.duration',
  'request.duration',
  'download.duration',
  'response.time.ms'
]; // There is also 'tls_negotiation' but it will not be present in the spans as the test does not make https requests

const httpRequestAttrs = [
  'http.method',
  'http.url',
  'http.scheme',
  'net.host.name'
];

const httpResponseAttrs = [
  'http.status_code',
  'http.flavor',
  'http.user_agent'
];

/**  Runs assertions for OTel Playwright tracing tests using 'tap' library. It checks that the trace data is correctly recorded, formatted and exported by the OTel plugin.
 * @param {Object} t - the tap library test object
 * @param {Object} testRunData - an object containing the console output of the test run, the report summary and the exported spans - `{ output, reportSummary, spans }`
 * @namespace expectedOutcome
 * @param {Object} expectedOutcome - an object containing the expected outcome values for the test run.
 * @param {string} expectedOutcome.scenarioName - the name of the scenario
 * @param {number} expectedOutcome.exitCode - the expected exit code of the test run
 * @param {number} expectedOutcome.vus - the number of VUs created
 * @param {number} expectedOutcome.reqPerVu - the number of requests made per VU
 * @param {number} expectedOutcome.reqSpansPerVu - the number of request spans created per VU
 * @param {number} [expectedOutcome.vusFailed] - the number of VUs that failed
 * @param {number} [expectedOutcome.errors] - the number of errors recorded
 * @param {number} [expectedOutcome.reqSpansWithErrorPerVu] - the number of request spans with errors recorded per VU
 * @param {number} expectedOutcome.spansWithErrorStatus - the total number of spans with error status
 * @param {Object} [expectedOutcome.userSetAttributes] - an object containing the user set attributes
 * @param {Array} [expectedOutcome.spanNamesByReqName] - an array of span names to be set by the request name
 * @param {Array} [expectedOutcome.spanNamesByMethod] - an array of span names to be set by the request method
 * @param {Array} [expectedOutcome.spanNamesReplaced] - an array of span names to be replaced by the replaceSpanNameRegex setting
 * @param {number} expectedOutcome.spansPerVu - the total number of spans created per VU - `setDynamicHTTPTraceExpectations` function can be used to calculate this value
 * @param {number} expectedOutcome.reqSpans - the total number of request spans created - `setDynamicHTTPTraceExpectations` function can be used to calculate this value
 * @param {number} expectedOutcome.totalSpans - the total number of spans to be created - `setDynamicHTTPTraceExpectations` function can be used to calculate this value
 * @param {number} expectedOutcome.reqSpansWithError - the total number of request spans with errors recorded - `setDynamicHTTPTraceExpectations` function can be used to calculate this value
 * @param {number} expectedOutcome.totalSpans - the total number of spans to be created - `setDynamicPlaywrightTraceExpectations` function can be used to calculate this value
 *
 *
 * #### Configuration settings and functionality covered:
 * - `scenarioName` config setting - sets the scenario span name
 * - `useRequestNames` config setting - sets the request span names to the request name
 *  - `replaceSpanNameRegex` config setting - replaces the specified pattern in page span names
 *  - `attributes` config setting - sets the user attributes for all spans
 *  - default id attributes - `test_id` and `vu.uuid` attributes for all spans
 *  - http request and response attributes - sets the http request and response specific attributes for the request spans
 *  - request phases attributes - sets the request phases attributes for the request spans
 *  - `plugins.publish-metrics.spans.exported` metric - emits the counter metric for the number of spans exported
 *  - errors - errors are recorded on traces both as error events and as the error status code
 *
 *
 * #### Configuration settings and functionality not covered - needs to be implemented in the future:
 *  - `sampleRate` config setting - loose percentage of spans to be sampled
 * - `smartSampling` config setting - tags and exports response outliers
 *
 * If any new features are added that add to or change the tracing format, this is where the change should be implemented to propagate to all tests.
 */
async function runHttpTraceAssertions(t, testRunData, expectedOutcome) {
  const { output, reportSummary, spans } = testRunData;

  const testId = getTestId(output.stdout);
  const requestSpans = spans.filter((span) => span.attributes['http.method']);
  const scenarioSpans = spans.filter((span) => !span.parentId);

  // Created VUs/traces
  t.equal(
    reportSummary.counters['vusers.created'],
    expectedOutcome.vus,
    `${expectedOutcome.vus} VUs should have been created`
  );
  t.equal(
    reportSummary.counters['vusers.created'],
    scenarioSpans.length,
    'The number of scenario spans should match the number of VUs created'
  );
  t.equal(
    spans.length,
    expectedOutcome.totalSpans,
    `There should be ${expectedOutcome.totalSpans} spans created in total`
  );

  // Errors and failed VUs
  t.equal(
    output.exitCode,
    expectedOutcome.exitCode,
    `CLI Exit Code should be ${expectedOutcome.exitCode}`
  );
  t.equal(
    reportSummary.counters['vusers.failed'],
    expectedOutcome.vusFailed || 0,
    `${expectedOutcome.vusFailed} VUs should have failed`
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
    expectedOutcome.errors || 0,
    `There should be ${expectedOutcome.errors} errors reported`
  );
  t.equal(
    spans.filter((span) => span.events[0]?.name === 'exception').length,
    expectedOutcome.errors || 0,
    'Num of errors in report should match the num of spans with error exception'
  ); // In http engine the only event we record is the error exception event so we can just check that event is present

  // We check the error span status separately from errors as it can be set to error even when no error is recorded, e.g. when http status code is 404 or over
  t.equal(
    spans.filter((span) => span.status.code === 2).length,
    expectedOutcome.spansWithErrorStatus,
    `${expectedOutcome.spansWithErrorStatus} spans should have the 'error' status`
  );

  if (expectedOutcome.errors || numErrorsReported) {
    const errorNum = expectedOutcome.errors || numErrorsReported;
    t.equal(
      spans.filter(
        (span) => span.events[0]?.name === 'exception' && span.status.code === 2
      ).length,
      errorNum,
      'Errors should be recorded on spans as an event and status code'
    );
    t.equal(
      requestSpans.filter((span) => span.events[0]?.name === 'exception')
        .length,
      errorNum,
      `${errorNum} request spans should have the error exception recorded`
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
    expectedOutcome.req,
    `${expectedOutcome.req} requests should have been made`
  );

  t.equal(
    requestSpans.length,
    expectedOutcome.reqSpans,
    `There should be ${expectedOutcome.reqSpans} request spans created in total.`
  );

  // If an error happens when trying to make a request (after before request hook) resulting in request not being made, we will still have the request span for it with the error recorded on the span
  // So the number of request spans will not be equal to the number of requests made
  if (!expectedOutcome.errors) {
    t.equal(
      requestSpans.length,
      reportSummary.counters['http.requests'],
      'The number of request spans should match the number of requests made'
    );
  }

  Object.keys(reportSummary.counters)
    .filter((counter) => {
      return counter.startsWith('http.codes.');
    })
    .forEach((metric) => {
      const statusCode = metric.split('.')[2];
      t.equal(
        requestSpans.filter(
          (span) =>
            span.attributes['http.status_code'] &&
            span.attributes['http.status_code'] === Number(statusCode)
        ).length,
        reportSummary.counters[metric],
        `The number of spans with status code ${statusCode} should match the number of requests with that status code`
      );
    });

  // Span names
  t.equal(
    scenarioSpans[0].name,
    expectedOutcome.scenarioName,
    'The scenario span should have the name of the scenario when set'
  );

  // `useRequestNames` check
  expectedOutcome.spanNamesByReqName
    .filter((span) => !expectedOutcome.spanNamesReplaced.includes(span.name))
    .forEach((name) => {
      t.equal(
        requestSpans.filter((span) => span.name === name).length,
        requestSpans.length / expectedOutcome.reqSpansPerVu,
        'When useRequestNames is set to true, the request span should have the name of the request if the name is set'
      );
    });

  expectedOutcome.spanNamesByMethod.forEach((name) => {
    t.equal(
      requestSpans.filter((span) => span.name === name).length,
      requestSpans.length / expectedOutcome.reqSpansPerVu,
      'If useRequestNames is not set, or if no request name is provided,the request span will be named by the request method'
    );
  });

  // `replaceSpanNameRegex` check
  expectedOutcome.spanNamesReplaced.forEach((name) => {
    t.equal(
      spans.filter((span) => span.name === name).length,
      spans.length / expectedOutcome.spansPerVu,
      'replaceSpanNameRegex appropriately replaces the pattern in span name'
    );
  });

  // Proper nesting
  const reqSpanNamesPerVU = expectedOutcome.spanNamesByReqName.concat(
    expectedOutcome.spanNamesByMethod
  );
  scenarioSpans
    .map((span) => span.id)
    .forEach((id) => {
      const siblingRequestSpans = requestSpans.filter(
        (requestSpan) => requestSpan.parentId === id
      );
      t.equal(
        siblingRequestSpans.length,
        expectedOutcome.reqSpansPerVu,
        `Each trace should have ${expectedOutcome.reqSpansPerVu} request spans`
      );
      siblingRequestSpans.forEach((span) => {
        t.ok(
          reqSpanNamesPerVU.includes(span.name),
          `Each trace should have a request span called ${span.name}`
        );
      });
    });

  // Attributes
  t.equal(
    spans.filter((span) => span.attributes.test_id).length,
    spans.length,
    'All spans should have the test_id attribute'
  );
  t.equal(
    spans.filter((span) => span.attributes.test_id === testId).length,
    spans.length,
    'All spans should have the correct test_id attribute value'
  );
  t.equal(
    spans.filter((span) => span.attributes['vu.uuid']).length,
    spans.length,
    'All spans should have the vu.uuid attribute'
  );

  requestSpans.forEach((span) => {
    t.hasProps(
      span.attributes,
      httpRequestAttrs,
      'All request spans should have the http request specific attributes'
    );
  });

  // Only check for request phases and httpResponseAttrs on successful requests that have no exceptions or error status
  requestSpans
    .filter(
      (span) =>
        !span.events[0] ||
        span.events[0].name !== 'exception' ||
        span.status.code !== 2
    )
    .forEach((span) => {
      t.hasProps(
        span.attributes,
        httpResponseAttrs,
        'All successful request spans should have the http response specific attributes'
      );

      t.hasProps(
        span.attributes,
        requestPhasesAttrs,
        'All successful request spans should have all request phases set as attributes'
      );
    });

  Object.keys(expectedOutcome.userSetAttributes).forEach((attr) => {
    t.equal(
      requestSpans.filter((span) => span.attributes[attr]).length,
      requestSpans.length,
      'All request should have the user set attributes'
    );
    t.equal(
      requestSpans.filter(
        (span) =>
          span.attributes[attr] === expectedOutcome.userSetAttributes[attr]
      ).length,
      requestSpans.length,
      'Correct values should be set for all user provided attributes'
    );
  });

  // Counter metric reported
  t.equal(
    reportSummary.counters['plugins.publish-metrics.spans.exported'],
    expectedOutcome.totalSpans,
    'The `plugins.publish-metrics.spans.exported` counter should match the total number of spans exported'
  );
}

module.exports = {
  runHttpTraceAssertions
};
