const { ConfigSchema } = require('./config');
const { ScenarioSchema } = require('./scenario');

const Joi = require('joi').defaults((schema) =>
  schema.options({ allowUnknown: true, abortEarly: true })
);

const schema = Joi.object({
  config: ConfigSchema,
  scenarios: Joi.array().items(ScenarioSchema).required()
  // before: ScenarioSchema
});

module.exports = {
  schema
};
