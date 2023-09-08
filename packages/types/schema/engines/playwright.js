const Joi = require('joi').defaults((schema) =>
  schema.options({ allowUnknown: true, abortEarly: true })
);

const artilleryStringNumber = Joi.alternatives(Joi.number(), Joi.string());

const PlaywrightSchemaObject = {
  testFunction: Joi.string(),
  flowFunction: Joi.string()
};

const PlaywrightConfigSchema = Joi.object({
  aggregateByName: Joi.alternatives(Joi.boolean(), Joi.string()),
  defaultTimeout: artilleryStringNumber,
  defaultNavigationTimeout: artilleryStringNumber,
  launchOptions: Joi.object(),
  contextOptions: Joi.object()
});

module.exports = {
  PlaywrightSchemaObject,
  PlaywrightConfigSchema
};
