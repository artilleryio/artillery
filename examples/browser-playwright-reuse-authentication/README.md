# Reuse Authentication in Playwright tests

Playwright allows you to use `sessionStorage` to reuse authentication in your tests. This can be especially useful in Load Testing, where you might be interested in testing other parts of the application at scale, without having to exercise the login backend (which is sometimes third-party) with every VU.

This example shows you how to do that.

## Pre-requisites

Before running the example, install Artillery:

```sh
npm install artillery
```

## Example

The example leverages [`storageState`] similarly to [Playwright documentation](https://playwright.dev/docs/auth#basic-shared-account-in-all-tests). It's simple to set this up with Artillery, but there are some small differences:

* You set the `storageState` path in [`config.engines.playwright.contextOptions`](https://www.artillery.io/docs/reference/engines/playwright#configuration), instead of a Playwright config file. Note that the [`$dirname` utility](https://www.artillery.io/docs/reference/test-script#test-level-variables) is needed to resolve the full path for Playwright.
* A [before hook](https://www.artillery.io/docs/reference/test-script#before-and-after-sections) will run the setup function (`loginUserAndSaveStorage` in this example), rather than referencing it as a Playwright project.
* You will need to create the storageState JSON (`storage.json` in this example) file first as an empty object (`{}`), in the same directory where you run the test from. This is because the first time Artillery runs, it will run the `before` hook, and the file referenced in `config` won't be available.

That's it!

To run the fully configured example, run:

```sh 
npx artillery run scenario.yml
```

*Note: this example runs with headless disabled, so you can easily observe the login being reused.*

## Running the example in Fargate

Want to run 1,000 browsers at the same time? 10,000? more? Run your load tests on AWS Fargate with [built-in support in Artillery](https://www.artillery.io/docs/load-testing-at-scale/aws-fargate). Just make sure to tell Artillery to include the `storage.json` file. For example:

```yaml
  config:
    ...
    includeFiles:
        - ./storage.json
```

This ensures the file is bundled to Fargate workers correctly. You will also need to make sure the test is running using headless mode. Then, run the test:

```sh 
npx artillery run:fargate scenario.yml --count 2
```

*Note: `before` hooks run once per Fargate worker, so the authentication step will run as many times as the `--count` you set.*