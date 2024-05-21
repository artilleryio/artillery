'use strict';

function getTestId(outputString) {
  const regex = /Test run id: \S+/;
  const match = outputString.match(regex);
  return match[0].replace('Test run id: ', '');
}

function setDynamicHTTPTraceExpectations(expectedOutcome) {
  if (!expectedOutcome.errors) {
    expectedOutcome.spansPerVu =
      1 +
      expectedOutcome.reqSpansPerVu +
      expectedOutcome.reqSpansPerVu * expectedOutcome.timePhaseSpansPerReqSpan; // 1 represents the root scenario/VU span
  } else {
    // If there are errors, the number of spans could be lower than expected - request spans with error might not have all the timing phase spans
    const reqSpansWithoutErrorPerVu =
      expectedOutcome.reqSpansPerVu - expectedOutcome.reqSpansWithErrorPerVu;
    expectedOutcome.spansPerVu =
      1 +
      expectedOutcome.reqSpansPerVu +
      reqSpansWithoutErrorPerVu * expectedOutcome.timePhaseSpansPerReqSpan +
      expectedOutcome.reqSpansWithErrorPerVu *
        expectedOutcome.timePhaseSpansPerReqSpanWithError;
    expectedOutcome.reqSpansWithError =
      expectedOutcome.reqSpansWithErrorPerVu * expectedOutcome.vus;
  }
  expectedOutcome.reqSpans =
    expectedOutcome.vus * expectedOutcome.reqSpansPerVu;
  expectedOutcome.totalSpans = expectedOutcome.vus * expectedOutcome.spansPerVu;
  return expectedOutcome;
}

function setDynamicPlaywrightTraceExpectations(expectedOutcome) {
  expectedOutcome.spansPerVu =
    1 + expectedOutcome.pageSpansPerVu + expectedOutcome.stepSpansPerVu; // 1 represents the root scenario/VU span
  expectedOutcome.pageSpans =
    expectedOutcome.vus * expectedOutcome.pageSpansPerVu;
  expectedOutcome.stepSpans =
    expectedOutcome.vus * expectedOutcome.stepSpansPerVu;
  expectedOutcome.totalSpans = expectedOutcome.vus * expectedOutcome.spansPerVu;
  return expectedOutcome;
}
module.exports = {
  getTestId,
  setDynamicHTTPTraceExpectations,
  setDynamicPlaywrightTraceExpectations
};
