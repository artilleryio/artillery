# Load testing and smoke testing with real browsers


Ever wished you could run load tests with *real browsers*? Well, now you can! You can combine Artillery with Playwright to run full browser tests, and this example shows you how. We can run both load tests, and smoke tests with headless browsers.


## Example 1: A simple load test

Run a simple load test using a plain Playwright script (recorded with `playwright codegen` - no Artillery-specific changes required):

```sh
npx artillery run browser-load-test.yml
```

That's it! Artillery will create headless Chrome browsers that will run Playwright scenarios you provide.

## Example 2: A smoke test

This example shows how we can implement a smoke test (or a synthetic check) using a headless browser.

We make use of Artillery's [CSV payload](https://artillery.io/docs/guides/guides/test-script-reference.html#Payload-files) feature to specify the URLs we want to check, and [custom metric API](https://artillery.io/docs/guides/guides/extending.html#Tracking-custom-metrics) to track custom metrics.

For every row in the CSV file, we'll load the URL from the first column, and check that the page contains the text specified in the second column.

The test will load each page specified in the CSV file, and check that it contains the text

```sh
npx artillery run browser-smoke-test.yml
```

## Example 3: Tracking custom metrics for part of the flow

A common usage scenario is reporting performance metrics only for one part of a test flow. For example, you may be testing an ecommerce app with the following steps:

1. Go to the homepage
2. Search for a product
3. Navigate to product page
4. Add product to cart
5. Login
6. Complete checkout:
  - Enter a discount code
  - Update billing info
  - Check out

You may want to report performance metrics only for part 6 of the flow. Artillery lets you do that with its [custom metrics API](https://www.artillery.io/docs/guides/guides/extension-apis#tracking-custom-metrics).

See the example in [./advanced-custom-metric-for-subflow.yml](./advanced-custom-metric-for-subflow.yml) and specifically the `multistepWithCustomMetrics()` test in [flows.js](./flows.js) for details.


## Creating Playwright scripts

You can use the built-in `playwright codegen` tool to generate test scripts quickly by performing user actions in the real browser. That's how the code in `flows.js` in this example was created. It's just a Playwright script, there's nothing Artillery specific about it. **Speed up test creation time by 10x.**

## Front-end AND back-end metrics

Artillery will emit both backend and browser-level performance metrics when running this test, so that you can see both how long resources such as static assets took to load, as well as page-level metrics, such as how long it took for pages to become interactive.

```
vusers.created_by_name.Dev account signup: .................. 10
vusers.created.total: ....................................... 10
vusers.completed: ........................................... 10
vusers.session_length:
  min: ...................................................... 3884.2
  max: ...................................................... 13846.2
  median: ................................................... 12711.5
  p95: ...................................................... 12968.3
  p99: ...................................................... 12968.3
browser.page_domcontentloaded: ........................... 20
browser.response_time:
  min: ...................................................... 0
  max: ...................................................... 1778.8
  median: ................................................... 37.7
  p95: ...................................................... 3828.5
  p99: ...................................................... 3828.5
browser.page_domcontentloaded.dominteractive:
  min: ...................................................... 297
  max: ...................................................... 2247
  median: ................................................... 1002.4
  p95: ...................................................... 1939.5
  p99: ...................................................... 1939.5
browser.page_domcontentloaded.dominteractive.https://artillery.io/:
  min: ...................................................... 427
  max: ...................................................... 2247
  median: ................................................... 1130.2
  p95: ...................................................... 1939.5
  p99: ...................................................... 1939.5
browser.page_domcontentloaded.dominteractive.https://artillery.io/pro/:
  min: ...................................................... 297
  max: ...................................................... 1927
  median: ................................................... 596
  p95: ...................................................... 1380.5
  p99: ...................................................... 1380.5
```

## Scale out

Want to run 1,000 browsers at the same time? 10,000? more? Run your load tests on AWS Fargate with built-in support in Artillery. See our guide for [Load testing on AWS Fargate](https://www.artillery.io/docs/load-testing-at-scale/aws-fargate) for more information.
