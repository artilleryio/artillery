

function getTestId(outputString) {
  const regex = /Test run id: \S+/;
  const match = outputString.match(regex);
  return match[0].replace('Test run id: ', '');
}

function setDynamicHTTPTraceExpectations(expectedOutcome) {
  if (expectedOutcome.errors) {
    expectedOutcome.reqSpansWithError = expectedOutcome.reqSpansWithErrorPerVu
      ? expectedOutcome.reqSpansWithErrorPerVu * expectedOutcome.vus
      : 0;
  }
  expectedOutcome.spansPerVu = 1 + expectedOutcome.reqSpansPerVu;
  expectedOutcome.reqSpans =
    expectedOutcome.vus * expectedOutcome.reqSpansPerVu;
  expectedOutcome.req = expectedOutcome.vus * expectedOutcome.reqPerVu;
  expectedOutcome.totalSpans = expectedOutcome.vus * expectedOutcome.spansPerVu;
  return expectedOutcome;
}

function setDynamicPlaywrightTraceExpectations(expectedOutcome) {
  expectedOutcome.spansPerVu =
    1 + expectedOutcome.pageSpansPerVu + (expectedOutcome.stepSpansPerVu || 0); // 1 represents the root scenario/VU span
  expectedOutcome.pageSpans =
    expectedOutcome.vus * expectedOutcome.pageSpansPerVu;
  expectedOutcome.totalSpans = expectedOutcome.vus * expectedOutcome.spansPerVu;

  if (expectedOutcome.stepSpansPerVu) {
    expectedOutcome.stepSpans =
      expectedOutcome.vus * expectedOutcome.stepSpansPerVu;
  }
  return expectedOutcome;
}

module.exports = {
  getTestId,
  setDynamicHTTPTraceExpectations,
  setDynamicPlaywrightTraceExpectations
};
