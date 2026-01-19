const Joi = require('joi').defaults((schema) =>
  schema.options({ allowUnknown: true, abortEarly: true })
);

const artilleryNumberOrString = Joi.alternatives(Joi.number(), Joi.string());
const artilleryBooleanOrString = Joi.alternatives(Joi.boolean(), Joi.string());

const buildArtilleryKeyValue = (joiSchema) =>
  Joi.object().pattern(/.*/, joiSchema);

module.exports = {
  artilleryNumberOrString,
  artilleryBooleanOrString,
  buildArtilleryKeyValue
};
