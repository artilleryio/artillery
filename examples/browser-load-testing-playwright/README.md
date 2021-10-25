# Load testing and smoke testing with real browsers

<p align="center">
  <img src="./repo-header.png" alt="Full browser load testing with Artillery + Playwright" width="1012">
</p>

Ever wished you could run load tests with *real browsers*? Well, now you can! You can combine Artillery with Playwright to run full browser tests, and this example shows you how. We can run both load tests, and smoke tests with headless browsers.

**Note**: this feature is in alpha stage. We'd love your feedback! -> [discord chatroom](https://discord.com/invite/QthdcAAPRK)

## Pre-requisites

Before running the examples, install Artillery + [`artillery-engine-playwright`](https://github.com/artilleryio/artillery-engine-playwright):

```sh
npm install
```

## Example 1: A simple load test

Run a simple load test using a plain Playwright script (recorded with `playwright codegen` - no Artillery-specific changes required):

```sh
$(npm bin)/artillery run browser-load-test.yml
```

That's it! Artillery will create headless Chrome browsers that will run Playwright scenarios you provide.

## Example 2: A smoke test

This example shows how we can implement a smoke test (or a synthetic check) using a headless browser. We make use of Artillery's [CSV payload](https://artillery.io/docs/guides/guides/test-script-reference.html#Payload-files) feature to specify the URLs we want to check, and [custom metric API](https://artillery.io/docs/guides/guides/extending.html#Tracking-custom-metrics) to track custom metrics.

```sh
$(npm bin)/artillery run browser-smoke-test.yml
```


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

Want to run 1,000 browsers at the same time? 10,000? more? `artillery-engine-playwright` is supported in [Artillery Pro](https://artillery.io/pro/). Which means that you can scale out and run a ridiculous amount of real browsers in your own AWS account, and it's all serverless with [AWS Fargate](https://aws.amazon.com/fargate/).