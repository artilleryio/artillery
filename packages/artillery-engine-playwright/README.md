# artillery-engine-playwright

<p align="center">
  <img src="./header.png" alt="Full browser load testing with Artillery + Playwright">
</p>

Ever wished you could run load tests with *real browsers*? Well, now you can.

This Artillery engine lets you combine Playwright with Artillery to be able to launch *a whole lot of real browsers* to do *full browser load testing*.

## At a glance

* 🤖&nbsp;&nbsp;&nbsp;Run load tests with real headless browsers (Chrome)
* 📊&nbsp;&nbsp;&nbsp;See most important front-end metrics ([Largest Contentful Paint (LCP)](https://web.dev/lcp/), [First Contentful Paint (FCP)](https://web.dev/fcp/) etc) and how they are affected by high load
* ♻️&nbsp;&nbsp;&nbsp;Reuse existing Playwright scripts for load testing
* 🏎&nbsp;&nbsp;&nbsp;Create new load testing scripts 10x faster with [`playwright codegen`](https://playwright.dev/docs/cli/#generate-code)
* 🌐&nbsp;&nbsp;&nbsp;Launch thousands of browsers, with **zero** infrastructure setup with [Artillery Pro](https://artillery.io/pro)


✨ *Perfect for testing complex web apps* ✨

## Why load test with browsers?

Load testing complex web apps can be time consuming, cumbersome, and brittle comparied to load testing pure APIs and backend services. The main reason is that testing web apps requires a different level of abstraction: whereas APIs work at **endpoint** level, when testing web apps a **page** is a much more useful abstraction.

Summarized in the table below:

|    | APIs & microservices      | Web apps |
 --- | ----------- | ----------- |
**Abstraction level**    | Endpoint      | Page       |
**Surface area**   | Small, a handful of endpoints        | Large, calls many APIs. Different APIs may be called depending on in-page actions by the user
**Formal spec** | Usually available (e.g. as an OpenAPI spec) | No formal specs for APIs used and their dependencies

All of those factors combined make load testing web apps with traditional approaches very frustrating and time consuming. 😞

## Usage ⌨️

Install Artillery and this engine:

```sh
npm install artillery@dev artillery-engine-playwright
```

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

(Note: this script was generated with [`playwright codegen`](https://playwright.dev/docs/cli/#generate-code))

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
  p99: ...................................................... 206.5```
```

## License 📃

MPL 2.0
