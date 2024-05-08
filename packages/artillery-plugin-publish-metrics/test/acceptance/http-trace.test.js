const { test, afterEach, beforeEach } = require('tap');
const { $ } = require('zx');
const fs = require('fs');
const {
  generateTmpReportPath,
  deleteFile,
  getTestId
} = require('../_helpers.js');

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
  const expectedVus = 4;
  const expectedRequestsPerVu = 2;
  const expectedTimePhaseSpansPerRequest = 5;
  const expectedSpansPerVu =
    1 +
    expectedRequestsPerVu +
    expectedRequestsPerVu * expectedTimePhaseSpansPerRequest; // 1 represents the root scenario/VU span
  const expectedRequests = expectedVus * expectedRequestsPerVu;
  const expectedTotalSpans = expectedVus * expectedSpansPerVu;
  const scenarioName = 'pm-test';
  const expectedVusFailed = 0;
  const timePhaseSpanNames = [
    'dns_lookup',
    'tcp_handshake',
    'request',
    'download',
    'first_byte'
  ]; // There is also 'tls_negotiation' but it will not be present in the spans as the test does not make https requests

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
          { get: { url: '/dino', name: 'dino' } },
          { get: { url: '/pony' } }
        ]
      }
    ]
  };
  const userSetAttributes =
    override.config.plugins['publish-metrics'][0].traces.attributes;

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

  t.equal(output.exitCode, 0, 'CLI Exit Code should be 0');
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
    reportSummary.counters['vusers.failed'],
    expectedVusFailed,
    'No VUs should have failed'
  );
  t.equal(
    spans.filter((span) => span.status === 2).length,
    expectedVusFailed,
    'There should be no errors recorded on the spans'
  );
  t.equal(
    spans.length,
    expectedTotalSpans,
    `There should be ${expectedTotalSpans} spans created in total`
  );

  // Request spans
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
        `Each request should have ${expectedTimePhaseSpansPerRequest} timing spans`
      );
    });

  // Span names and useRequestNames setting
  t.equal(
    scenarioSpans[0].name,
    scenarioName,
    'The scenario span should have the name of the scenario when set'
  ); // If one is named correctly all will be, as all are set the same
  t.equal(
    requestSpans.filter((span) => span.name === 'dino').length,
    requestSpans.length / 2,
    'When useRequestNames is set to true, the request span should have the name of the request if the name is set'
  ); // Request name was provided for only one of the 2 requests in the scenario
  t.equal(
    requestSpans.filter(
      (span) => span.name === span.attributes['http.method'].toLowerCase()
    ).length,
    requestSpans.length / 2,
    'When useRequestNames is set to true, if no request name is provided,the request span will be named by the request method'
  );
  t.equal(
    timingSpans.filter((span) => timePhaseSpanNames.includes(span.name)).length,
    timingSpans.length,
    'Time phase spans should have correct names'
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
});
