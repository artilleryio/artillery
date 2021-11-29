# artillery-engine-playwright

<p align="center">
  <img src="./header.png" alt="Full browser load testing with Artillery + Playwright" width="1012">
</p>

<p align="center">
  Questions, comments, feedback? ➡️&nbsp;&nbsp;&nbsp;<a href="https://github.com/artilleryio/artillery/discussions">Artillery Discussion Board</a>
</p>

----

Ever wished you could run load tests with *real browsers*? Well, now you can.

This Artillery engine lets you combine Playwright with Artillery to be able to launch *a whole lot of real browsers* to do *full browser load testing*.

## At a glance

* 🤖&nbsp;&nbsp;&nbsp;Run load tests with real (headless) Chrome instances
* 🛰&nbsp;&nbsp;&nbsp;Run synthetic checks in CICD with the same Artillery + Playwright scripts
* 📊&nbsp;&nbsp;&nbsp;See most important front-end metrics ([Largest Contentful Paint (LCP)](https://web.dev/lcp/), [First Contentful Paint (FCP)](https://web.dev/fcp/) etc) and how they are affected by high load
* ♻️&nbsp;&nbsp;&nbsp;Reuse existing Playwright scripts for load testing (full access to [`page` API](https://playwright.dev/docs/api/class-page/))
* 🏎&nbsp;&nbsp;&nbsp;Create new load testing scripts 10x faster with [`playwright codegen`](https://playwright.dev/docs/cli/#generate-code)
* 🌐&nbsp;&nbsp;&nbsp;Launch thousands of browsers, with **zero** infrastructure setup with [Artillery Pro](https://artillery.io/pro)

✨ *Perfect for testing complex web apps* ✨

## Why load test with browsers?

Load testing complex web apps can be time consuming, cumbersome, and brittle compared to load testing pure APIs and backend services. The main reason is that testing web apps requires a different level of abstraction: whereas APIs work at **endpoint** level, when testing web apps a **page** is a much more useful abstraction.

Summarized in the table below:

|    | APIs & microservices      | Web apps |
 --- | ----------- | ----------- |
**Abstraction level**    | HTTP endpoint      | Whole page       |
**Surface area**   | Small, a handful of endpoints        | Large, calls many APIs. Different APIs may be called depending on in-page actions by the user
**Formal spec** | Usually available (e.g. as an OpenAPI spec) | No formal specs for APIs used and their dependencies. You have to spend time in Dev Tools to track down all API calls
**In-page JS** | Ignored. Calls made by in-page JS have to be accounted for manually and emulated | Runs as expected, e.g. making calls to more HTTP endpoints |

All of those factors combined make load testing web apps with traditional approaches very frustrating and time consuming. 😞

## Usage ⌨️

### Installation

Install Artillery and this engine:

```sh
npm install -g artillery@dev artillery-engine-playwright
```

(See [Use in Docker/CI](#use-in-dockerci) if running tests in Docker/CI)

### Running a test

Create an Artillery script:

`hello-world.yml`:

```yaml
config:
  target: https://artillery.io
  # Enable the Playwright engine:
  engines:
    playwright: {}
  processor: "./flows.js"
scenarios:
  - engine: playwright
    flowFunction: "helloFlow"
    flow: []
```

Use a Playwright script to describe virtual user scenario:

(Note: this script was generated with [`playwright codegen`](https://playwright.dev/docs/cli/#generate-code). `page` is an instance of [Playwright page](https://playwright.dev/docs/api/class-page/).)

`flow.js`:

```js
module.exports = { helloFlow };

function helloFlow(page) {
  //
  // The code below is just a standard Playwright script:
  //
  // Go to https://artillery.io/
  await page.goto('https://artillery.io/');
  // Click text=Pricing
  await page.click('text=Pricing');
  // assert.equal(page.url(), 'https://artillery.io/pro/');
  // Click text=Sign up
  await page.click('text=Sign up');
}
```

Run it:

```sh
artillery run hello-world.yml
```

Artillery runs Playwright-based scenarios, and provides user-centric metrics that measure [perceived load speed](https://web.dev/user-centric-performance-metrics/#types-of-metrics) such as LCP and FCP:

```
--------------------------------
Summary report @ 11:24:53(+0100)
--------------------------------

vusers.created_by_name.Dev account signup: .................. 1
vusers.created.total: ....................................... 1
vusers.completed: ........................................... 1
vusers.session_length:
  min: ...................................................... 5911.7
  max: ...................................................... 5911.7
  median: ................................................... 5944.6
  p95: ...................................................... 5944.6
  p99: ...................................................... 5944.6
browser.page.domcontentloaded: .............................. 2
browser.page.domcontentloaded.https://artillery.io/: ........ 1
browser.page.domcontentloaded.https://artillery.io/pro/: .... 1
browser.page.FCP.https://artillery.io/:
  min: ...................................................... 1521.1
  max: ...................................................... 1521.1
  median: ................................................... 1525.7
  p95: ...................................................... 1525.7
  p99: ...................................................... 1525.7
browser.page.dominteractive:
  min: ...................................................... 162
  max: ...................................................... 1525
  median: ................................................... 162.4
  p95: ...................................................... 162.4
  p99: ...................................................... 162.4
browser.page.dominteractive.https://artillery.io/:
  min: ...................................................... 1525
  max: ...................................................... 1525
  median: ................................................... 1525.7
  p95: ...................................................... 1525.7
  p99: ...................................................... 1525.7
browser.page.LCP.https://artillery.io/:
  min: ...................................................... 1521.1
  max: ...................................................... 1521.1
  median: ................................................... 1525.7
  p95: ...................................................... 1525.7
  p99: ...................................................... 1525.7
browser.page.dominteractive.https://artillery.io/pro/:
  min: ...................................................... 162
  max: ...................................................... 162
  median: ................................................... 162.4
  p95: ...................................................... 162.4
  p99: ...................................................... 162.4
browser.page.FCP.https://artillery.io/pro/:
  min: ...................................................... 205.3
  max: ...................................................... 205.3
  median: ................................................... 206.5
  p95: ...................................................... 206.5
  p99: ...................................................... 206.5
browser.page.LCP.https://artillery.io/pro/:
  min: ...................................................... 205.3
  max: ...................................................... 205.3
  median: ................................................... 206.5
  p95: ...................................................... 206.5
  p99: ...................................................... 206.5
```

## Flow function API

By default, only the `page` argument (see Playwright's [`page` API](https://playwright.dev/docs/api/class-page/)) is required for functions that implement Playwright scenarios, e.g.:

```js
module.exports = { helloFlow };

function helloFlow(page) {
  // Go to https://artillery.io/
  await page.goto('https://artillery.io/');
}
```

The functions also have access to virtual user context and events arguments, which can be used to access scenario variables for different virtual users, or to [track custom metrics](https://artillery.io/docs/guides/guides/extending.html#Tracking-custom-metrics).

```js
module.exports = { helloFlow };

function helloFlow(page, vuContext, events) {
  // Increment custom counter:
  events.emit('counter', 'user.page_loads', 1);
  // Go to https://artillery.io/
  await page.goto('https://artillery.io/');
}
```

## More examples

See [Artillery + Playwright examples](https://github.com/artilleryio/artillery-examples/tree/main/browser-load-testing-playwright) in `artillery-examples` repo.

## Use in Docker/CI

Use the [`Dockerfile`](./Dockerfile) which bundles Chrome, Playwright and Artillery to run your tests in CI.

**Note:** To keep the Docker image small, browsers other than Chromium are removed (the saving is ~500MB)

## Questions, comments, feedback?

➡️&nbsp;&nbsp;&nbsp;Let us know via <a href="https://github.com/artilleryio/artillery/discussions">Artillery Discussion board</a>


----


## License 📃

MPL 2.0
