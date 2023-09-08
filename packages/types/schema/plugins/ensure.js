const Joi = require('joi');

const artilleryStringNumber = Joi.alternatives(Joi.number(), Joi.string());
const EnsureLegacyOptions = {
  min: artilleryStringNumber,
  max: artilleryStringNumber,
  median: artilleryStringNumber,
  p95: artilleryStringNumber,
  p99: artilleryStringNumber,
  maxErrorRate: artilleryStringNumber
};

const EnsurePluginConfigSchema = Joi.object({
  thresholds: Joi.array().items(Joi.object()), //TODO: this is typed wrong
  conditions: Joi.array().items(
    Joi.object({
      expression: Joi.string(),
      strict: Joi.boolean()
    })
  ), //TODO: check that conditions are typed right
  ...EnsureLegacyOptions
}).unknown(false);

module.exports = {
  EnsurePluginConfigSchema
};
