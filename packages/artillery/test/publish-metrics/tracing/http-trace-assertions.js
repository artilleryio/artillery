'use strict';

const { getTestId } = require('../fixtures/helpers.js');

const timePhaseSpanNames = [
  'dns_lookup',
  'tcp_handshake',
  'request',
  'download',
  'first_byte'
]; // There is also 'tls_negotiation' but it will not be present in the spans as the test does not make https requests

async function runHttpTraceAssertions(t, testRunData, expectedOutcome) {
  const { output, reportSummary, spans } = testRunData;

  const testId = getTestId(output.stdout);
  const requestSpans = spans.filter((span) => span.attributes['http.method']);
  const timingPhaseSpans = spans.filter(
    (span) => !span.attributes['http.method'] && span.parentId
  );
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
    expectedOutcome.vusFailed,
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
    expectedOutcome.errors,
    `There should be ${expectedOutcome.errors} errors reported`
  );
  t.equal(
    spans.filter((span) => span.events[0]?.name === 'exception').length,
    expectedOutcome.errors,
    'Num of errors in report should match the num of spans with error exception'
  ); // In http engine the only event we record is the error exception event so we can just check that event is present

  // We check the error span status separately from errors as it can be set to error even when no error is recorded, e.g. when http status code is 404 or over
  t.equal(
    spans.filter((span) => span.status.code === 2).length,
    expectedOutcome.spansWithErrorStatus,
    `${expectedOutcome.spansWithErrorStatus} spans should have the 'error' status`
  );

  if (expectedOutcome.errors) {
    t.equal(
      spans.filter(
        (span) => span.events[0]?.name === 'exception' && span.status.code === 2
      ).length,
      expectedOutcome.errors,
      'Errors should be recorded on spans as an event and status code'
    );
    t.equal(
      requestSpans.filter((span) => span.events[0]?.name === 'exception')
        .length,
      expectedOutcome.reqSpansWithError,
      `${expectedOutcome.reqSpansWithError} request spans should have the error exception recorded`
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
    expectedOutcome.reqPerVu * expectedOutcome.vus,
    `${
      expectedOutcome.reqPerVu * expectedOutcome.vus
    } requests should have been made`
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
        expectedOutcome.reqSpansPerVu,
        `Each trace should have ${expectedOutcome.reqSpansPerVu} request spans`
      );
    });

  requestSpans.forEach((span) => {
    const siblingTimingPhaseSpans = timingPhaseSpans.filter(
      (timingSpan) => timingSpan.parentId === span.id
    );
    const hasError = span.events[0]?.name === 'exception';
    const expectedCount = hasError
      ? expectedOutcome.timePhaseSpansPerReqSpanWithError
      : expectedOutcome.timePhaseSpansPerReqSpan;
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
    expectedOutcome.scenarioName,
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
}

module.exports = {
  runHttpTraceAssertions
};
