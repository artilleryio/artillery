# artillery-engine-playwright

<p align="center">
  <img src="./header.png" alt="Full browser load testing with Artillery + Playwright">
</p>

Ever wished you could run load tests with *real browsers*? Well, now you can. This engine lets you combine Playwright with Artillery to be able to launch a whole lot of browsers to do full browser load testing.

## Use cases ✨
- Re-use existing Playwright scripts for load testing
- Use [`playwright codegen`](https://playwright.dev/docs/cli/#generate-code) to create scripts for load testing *ridicuolously quickly*
- Use your own AWS account to launch thousands of browsers, with **zero** infrastructure setup needed with [Artillery Pro](https://artillery.io/pro)

## Usage ⌨️

Install Artillery and this engine:

```sh
npm install artillery artillery-engine-playwright
```

Create an Artillery script:

`hello-world.yml`:

```yaml
config:
  target: https://artillery.io
  engines:
    playwright: {}
  processor: "./flows.js"
scenarios:
  - engine: playwright
    flowFunction: "helloFlow"

```

Use a Playwright script to describe virtual user scenario:

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

Artillery runs Playwright-based scenarios, and emits browser-level performance metrics, such as `browser.page_domcontentloaded.dominteractive` with a breakdown of how long it took for each page to load & render:

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

## License 📃

MPL 2.0