const Joi = require('joi').defaults((schema) =>
  schema.options({ allowUnknown: true, abortEarly: true })
);

const { artilleryNumberOrString } = require('../joi.helpers');

const PlaywrightSchemaObject = {
  testFunction: Joi.string()
    .meta({ title: 'Test function' })
    .description('Equivalent to flowFunction.'),
  flowFunction: Joi.string()
    .meta({ title: 'Flow function' })
    .description('Equivalent to testFunction.')
};

const PlaywrightConfigSchema = Joi.object({
  aggregateByName: Joi.alternatives(Joi.boolean(), Joi.string())
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
  launchOptions: Joi.object()
    .meta({ title: 'Playwright launch options' })
    .description(
      'Arguments for the `browser.launch()` call in Playwright.\nhttps://playwright.dev/docs/api/class-browsertype#browser-type-launch'
    ),
  contextOptions: Joi.object()
    .meta({ title: 'Playwright context options' })
    .description(
      'Arguments for the `browser.newContext()` call in Playwright.\nhttps://playwright.dev/docs/api/class-browser#browser-new-context'
    )
});

module.exports = {
  PlaywrightSchemaObject,
  PlaywrightConfigSchema
};
