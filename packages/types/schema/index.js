const { ConfigSchema } = require('./config');
const { ScenarioSchema, BeforeAfterScenarioSchema } = require('./scenario');

const Joi = require('joi').defaults((schema) =>
  schema.options({ allowUnknown: true, abortEarly: true })
);

const schema = Joi.object({
  config: ConfigSchema,
  scenarios: Joi.array().items(ScenarioSchema).required(), //TODO make this optional?
  before: BeforeAfterScenarioSchema,
  after: BeforeAfterScenarioSchema
});

module.exports = {
  schema
};
