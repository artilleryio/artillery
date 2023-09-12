const { ConfigSchema } = require('./config');
const { ScenarioSchema, BeforeAfterSchema } = require('./scenario');

const Joi = require('joi').defaults((schema) =>
  schema.options({ allowUnknown: true, abortEarly: true })
);

const schema = Joi.object({
  config: ConfigSchema.meta({ title: 'Config Section' }).description(
    'https://www.artillery.io/docs/reference/test-script#config-section'
  ),
  scenarios: Joi.array()
    .items(ScenarioSchema)
    // .required() //TODO: conditionally make this required for runtime schema validation
    .meta({ title: 'Scenarios Section' })
    .description(
      'Definition of scenarios for your VUs to run:\nhttps://www.artillery.io/docs/reference/test-script#scenarios-section'
    ),
  before: BeforeAfterSchema.meta({
    title: 'Before Section'
  }).description(
    "Optional scenario to run once per test before the main scenarios section (in distributed mode, it's once per worker).\nhttps://www.artillery.io/docs/reference/test-script#before-and-after-sections"
  ),
  after: BeforeAfterSchema.meta({ title: 'After Section' }).description(
    "Optional scenario to run once per test after the main scenarios section (in distributed mode, it's once per worker).\nhttps://www.artillery.io/docs/reference/test-script#before-and-after-sections"
  )
});

module.exports = {
  schema
};
