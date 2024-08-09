# Reusing Typescript Playwright code as Artillery code

This example shows you how you can reuse a pure Playwright codebase written in Typescript as Artillery tests.

The `e2e/` folder contains the Playwright test (`e2e/tests/get-issues.spec.ts`). The logic in that test has been abstracted to a helper in `e2e/helpers/index.ts`.

The `performance` folder contains the Artillery/Playwright test. Using the same helper, we can construct an Artillery test by importing it in our processor file (`./performance/processor.ts`) and calling it as the `testFunction` in our test (`./performance/search-for-ts-doc.yml`). The `target` used matches the `baseURL` from the playwright config in `e2e/playwright.config.ts`.

## Running the tests

First, run `npm install`.

To run the pure Playwright example:
`cd e2e && npx playwright run`

To run the same test as an Artillery test:
`cd performance && npx artillery run search-for-ts-doc.yml`

## Using a Page Object Model

In this example we didn't use a [Page Object Model](https://playwright.dev/docs/pom). However, similar concepts can be applied. You can have a centralised Page Object Model with methods for most UI actions, or even specific user flows, and then just call those as appropriate in both Playwright and Artillery tests.

## Playwright Version Compatibility

It's important to note that Artillery uses specific versions of Playwright, which are listed in our [documentation](https://www.artillery.io/docs/reference/engines/playwright#playwright-compatibility).

Your regular Playwright tests must use features that are compatible with the versions used by Artillery.

The `@playwright/test` version installed in your package.json should ideally match the version Artillery is currently using.