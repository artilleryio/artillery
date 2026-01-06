const Joi = require('joi').defaults((schema) =>
  schema.options({ allowUnknown: true, abortEarly: true })
);

const {
  artilleryNumberOrString,
  artilleryBooleanOrString
} = require('../joi.helpers');

const PlaywrightSchemaObject = {
  testFunction: Joi.string()
    .meta({ title: 'Test function' })
    .description('Equivalent to flowFunction.'),
  flowFunction: Joi.string()
    .meta({ title: 'Flow function' })
    .description('Equivalent to testFunction.')
};

const PlaywrightConfigSchema = Joi.object({
  aggregateByName: artilleryBooleanOrString
    .meta({ title: 'Aggregate by name' })
    .description(
      'Aggregate Artillery metrics by test scenario name.\nhttps://www.artillery.io/docs/reference/engines/playwright#aggregate-metrics-by-scenario-name'
    ),
  defaultTimeout: artilleryNumberOrString
    .meta({ title: 'Default timeout' })
    .description(
      'Default maximum time (in seconds) for all Playwright methods accepting the `timeout` option.\nhttps://playwright.dev/docs/api/class-browsercontext#browser-context-set-default-timeout'
    ),
  defaultNavigationTimeout: artilleryNumberOrString
    .meta({ title: 'Default navigation timeout' })
    .description(
      'Default maximum navigation time (in seconds) for Playwright navigation methods, like `page.goto()`.\nhttps://playwright.dev/docs/api/class-browsercontext#browser-context-set-default-navigation-timeout'
    ),
  testIdAttribute: Joi.string()
    .meta({ title: 'Test ID Attribute' })
    .description(
      'When set, changes the attribute used by locator `page.getByTestId` in Playwright. \n https://playwright.dev/docs/api/class-framelocator#frame-locator-get-by-test-id'
    ),
  extendedMetrics: artilleryBooleanOrString
    .meta({ title: 'Playwright Extended Metrics' })
    .description(
      'If enabled, Artillery will collect additional metrics from Playwright.\nCheck more information here: https://www.artillery.io/docs/reference/engines/playwright#extended-metrics'
    ),
  showAllPageMetrics: artilleryBooleanOrString
    .meta({ title: 'Web Vitals on all Pages' })
    .description(
      'If enabled, Artillery will collect Web Vitals for all pages, rather than just ones that start with target URL.\nCheck more information here: https://www.artillery.io/docs/reference/engines/playwright#show-web-vital-metrics-for-all-pages'
    ),
  launchOptions: Joi.object()
    .meta({ title: 'Playwright launch options' })
    .description(
      'Arguments for the `browser.launch()` call in Playwright.\nhttps://playwright.dev/docs/api/class-browsertype#browser-type-launch'
    ),
  contextOptions: Joi.object()
    .meta({ title: 'Playwright context options' })
    .description(
      'Arguments for the `browser.newContext()` call in Playwright.\nhttps://playwright.dev/docs/api/class-browser#browser-new-context'
    ),
  useSeparateBrowserPerVU: artilleryBooleanOrString
    .meta({ title: 'Use a separate browser process for each VU' })
    .description(
      'If enabled, a new browser process will be created for each VU. By default Artillery uses new browser contexts for new VUs.\nWARNING: Using this option is discouraged as it will increase CPU/memory usage of your tests.\nhttps://www.artillery.io/docs/reference/engines/playwright#configuration'
    ),
  stripQueryString: artilleryBooleanOrString
    .meta({ title: 'Strip Query String' })
    .description(
      'Strip query strings from page URLs when generating metrics. Similar to the metrics-by-endpoint plugin for HTTP tests.'
    )
    .default(false),
  normalizeQueryString: artilleryBooleanOrString
    .meta({ title: 'Normalize Query String' })
    .description(
      'Replace parameter values in query strings with placeholders when generating metrics. Numeric values become NUMBER, string values become STRING. For example, /page?id=123 becomes /page?id=NUMBER and /page?name=john becomes /page?name=STRING'
    )
    .default(true)
});

module.exports = {
  PlaywrightSchemaObject,
  PlaywrightConfigSchema
};
