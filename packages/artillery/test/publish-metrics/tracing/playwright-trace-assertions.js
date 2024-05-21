'use strict';

const { getTestId } = require('../fixtures/helpers.js');

/**  Runs assertions for OTel Playwright tracing tests using 'tap' library. It checks that the trace data is correctly recorded, formatted and exported by the OTel plugin.

  @param {Object} t - the tap library test object
  @param {Object} testRunData - an object containing the console output of the test run, the report summary and the exported spans - `{ output, reportSummary, spans }`
  @param {Object} expectedOutcome - an object containing the expected outcome values for the test run.
      Must contain the following:
        - `scenarioName` - the name of the scenario
        - `exitCode` - the expected exit code of the test run
        - `vus` - the number of VUs created
        - `vusFailed` - the number of VUs that should fail
        - `errors` - the number of errors to be reported
        - `spansWithErrorStatus` - the number of spans that should have the error status
        - `pageSpans` - the number of page spans to be created
        - `stepSpans` - the number of step spans to be created
        - `totalSpans` - the total number of spans to be created
        - `pageSpansPerVu` - the number of page spans per VU
        - `stepSpansPerVu` - the number of step spans per VU
        - `stepNames` - an array of step names defined in the testFunction - the final version of names when `replaceSpanRegex` is used
        - `pageSpanNames` - an array of page span names expected - the final version of names when `replaceSpanRegex` is used
        - `pagesVisitedPerVU` - an array of page URLs to be visited by each VU
        - `userSetAttributes` - an object containing the user set attributes
        - `modifiedSpanNames` - an object containing the expected modified span names
          {
            steps: [stepName1, stepName2, ...],
            pages: [pageName1, pageName2, ...]
          }
    
   #### Configuration settings and functionality covered:
    - `replaceSpanNameRegex` config setting - replaces the specified pattern in page span names
    - `attributes` config setting - sets the user attributes for all spans
    - default attributes - `test_id` and `vu.uuid` attributes for all spans
    - web vitals recording - adds the web vitals values and ratings as attributes and events to the page spans when reported
    - navigation events - adds the navigation events to the scenario spans
    - `plugins.publish-metrics.spans.exported` metric - emits the counter metric for the number of spans exported
    - errors - errors are recorded on traces both as error events and as the error status code
  
   #### Configuration settings and functionality not covered - needs to be implemented in the future:
     - `sampleRate` config setting - lose percentage of spans to be sampled
  If any new features are added that add to or change the tracing format, this is where the change should be implemented to propagate to all tests.
*/
async function runPlaywrightTraceAssertions(t, testRunData, expectedOutcome) {
  const { output, reportSummary, spans } = testRunData;
  const testId = getTestId(output.stdout);

  const scenarioSpans = spans.filter((span) => !span.parentId);
  const pageSpans = spans.filter(
    (span) =>
      (span.name.startsWith('Page') || span.attributes.url) && span.parentId
  );
  const stepSpans = spans.filter(
    (span) =>
      (!span.name.startsWith('Page') || !span.attributes.url) && span.parentId
  );
  const stepsReported = Object.keys(reportSummary.summaries)
    .filter((metricName) => metricName.startsWith('browser.step.'))
    .map((metricName) => metricName.replace('browser.step.', ''));

  // Span counts
  t.equal(
    reportSummary.counters['vusers.created'],
    expectedOutcome.vus,
    `${expectedOutcome.vus} VUs should have been created`
  );
  t.equal(
    [...new Set(spans.map((span) => span.traceId))].length,
    reportSummary.counters['vusers.created'],
    'The number of traces should match the number of VUs created'
  );
  t.equal(
    scenarioSpans.length,
    reportSummary.counters['vusers.created'],
    'The number of scenario spans should match the number of VUs created'
  );
  t.equal(
    pageSpans.length,
    expectedOutcome.pageSpans,
    `${expectedOutcome.pageSpans} page spans should have been created`
  );

  expectedOutcome.stepNames.forEach((name) => {
    t.ok(
      stepsReported.includes(name),
      'All expected steps should have been reported'
    );
  });
  t.equal(
    stepSpans.length,
    expectedOutcome.stepSpans,
    `${expectedOutcome.stepSpans} step spans should have been created`
  );
  t.equal(
    spans.length,
    expectedOutcome.totalSpans,
    `There should be ${expectedOutcome.totalSpans} spans created in total`
  );

  // Counter metric reported
  t.equal(
    reportSummary.counters['plugins.publish-metrics.spans.exported'],
    expectedOutcome.totalSpans,
    'The `plugins.publish-metrics.spans.exported` counter should match the total number of spans exported'
  );

  // Errors and failed VUs
  const errorsReported = Object.keys(reportSummary.counters).filter(
    (metricName) => metricName.startsWith('errors.')
  );
  const numErrorsReported = errorsReported.reduce(
    (acc, metricName) => acc + reportSummary.counters[metricName],
    0
  );
  const spansWithErrorStatus = spans.filter((span) => span.status.code === 2);
  const spansWithErrorEvents = spans.filter((span) =>
    span.events.some((event) => event.name === 'exception')
  );

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
  t.equal(
    numErrorsReported,
    expectedOutcome.errors,
    `There should be ${expectedOutcome.errors} errors reported`
  );

  // Span status can be set to error even when no error is recorded so we check status separately from error events
  t.equal(
    spansWithErrorStatus.length,
    expectedOutcome.spansWithErrorStatus,
    `${expectedOutcome.spansWithErrorStatus} spans should have the error status`
  );

  t.equal(
    spansWithErrorEvents.length,
    numErrorsReported,
    'Num of errors in report should match the num of spans with the error status'
  );
  t.ok(
    spansWithErrorEvents.every((span) => span.status.code === 2),
    'The error status code should be set on all spans with error events'
  );

  // `replaceSpanNameRegex` should replace the specified pattern in page span names
  if (expectedOutcome.modifiedSpanNames) {
    const numStepSpansPerStep =
      stepSpans.length / expectedOutcome.stepNames.length;
    expectedOutcome.modifiedSpanNames.steps.forEach((stepName) => {
      t.equal(
        stepSpans.filter((span) => span.name === stepName).length,
        numStepSpansPerStep,
        `All step spans should have the modified name '${stepName}'`
      );
    });

    const numPageSpansPerPage =
      pageSpans.length / expectedOutcome.pageSpanNames.length;
    expectedOutcome.modifiedSpanNames.pages.forEach((pageName) => {
      t.equal(
        pageSpans.filter((span) => span.name === pageName).length,
        numPageSpansPerPage,
        `All page spans should have the modified name '${pageName}'`
      );
    });
  }
  // Per VU/trace:
  scenarioSpans.forEach((span) => {
    t.equal(
      span.name,
      expectedOutcome.scenarioName,
      'The root span should be named after the scenario'
    );
    // each scenario span should have expected num of page spans and step spans
    const pages = pageSpans
      .filter((pageSpan) => pageSpan.parentId === span.id)
      .map((pageSpan) => pageSpan.name);
    const steps = stepSpans
      .filter((stepSpan) => stepSpan.parentId === span.id)
      .map((stepSpan) => stepSpan.name);
    const eventNames = span.events.map((event) => event.name);

    t.equal(
      pages.length,
      expectedOutcome.pageSpansPerVu,
      `Each scenario span should have ${expectedOutcome.pageSpansPerVu} page spans`
    );
    t.equal(
      steps.length,
      expectedOutcome.stepSpansPerVu,
      `Each scenario span should have ${expectedOutcome.stepSpansPerVu} step spans`
    );

    // each scenario span has the appropriate page and step spans - by name
    expectedOutcome.stepNames.forEach((name) => {
      t.ok(
        steps.includes(name),
        `Each scenario span should have a step span named '${name}'`
      );
    });
    expectedOutcome.pageSpanNames.forEach((name) => {
      t.ok(
        pages.includes(name),
        `Each scenario span should have a page span named '${name}'`
      );
    });

    // each scenario span has the appropriate navigation events
    const navigationEvents = span.events
      .map((event) => event.name)
      .filter((eventName) => eventName.startsWith('navigated to'));
    t.equal(
      navigationEvents.length,
      expectedOutcome.pageSpansPerVu,
      'The number of navigation events should match the number of pages visited'
    );

    expectedOutcome.pagesVisitedPerVU.forEach((page) => {
      t.ok(
        eventNames.includes(`navigated to ${page}`),
        `Each scenario span should have a navigation event for '${page}'`
      );
    });
  });

  // Attributes
  spans.forEach((span) => {
    t.has(
      span.attributes,
      expectedOutcome.userSetAttributes,
      'All spans should have the user set attributes'
    );
    t.hasProps(
      span.attributes,
      ['test_id', 'vu.uuid'],
      'All spans should have the test_id and vu.uuid attributes'
    );
    t.equal(
      span.attributes['test_id'],
      testId,
      'All spans should have the correct test_id attribute value'
    );
  });

  // Web Vitals
  const webVitals = ['LCP', 'FCP', 'CLS', 'TTFB', 'INP', 'FID'];

  // Since the web vitals are not reported consistently for all pages or vusers:
  // - we get all web vitals reported for the test run
  const webVitalMetricsReported = Object.keys(reportSummary.summaries).filter(
    (metricName) =>
      metricName.startsWith('browser.page') &&
      webVitals.includes(metricName.split('.')[2])
  );

  // - group the page spans by url
  const pageSpansPerUrl = pageSpans.reduce((acc, pageSpan) => {
    // console.log('PAGE SPAN URL: ', pageSpan.attributes.url)
    if (!acc[pageSpan.attributes.url]) {
      acc[pageSpan.attributes.url] = [];
    }
    acc[pageSpan.attributes.url].push(pageSpan);
    return acc;
  }, {});

  // - check that the web vitals reported for a page are added to some of its page spans as attributes and events (vitals are aggregated by url in report so we can not check for exact match of vitals for each page span)
  webVitalMetricsReported.forEach((metricName) => {
    // the metric name format is 'browser.page.[vital].[url]'
    const [, , vital, ...urlArr] = metricName.split('.');
    const url = urlArr.join('.');
    t.ok(
      pageSpansPerUrl[url].some(
        (pageSpan) =>
          pageSpan.attributes.hasOwnProperty(`web_vitals.${vital}.value`) &&
          pageSpan.attributes.hasOwnProperty(`web_vitals.${vital}.rating`)
      ),
      `${vital} value and rating reported for '${url}' should be added to its page span`
    );
    t.ok(
      pageSpansPerUrl[url].some((pageSpan) =>
        pageSpan.events.some((event) => event.name === vital)
      ),
      `${vital} web vital reported for '${url}' should be added to its page span as an event`
    );
  });
}

module.exports = {
  runPlaywrightTraceAssertions
};
