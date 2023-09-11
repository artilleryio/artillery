const artilleryNumberOrString = Joi.alternatives(Joi.number(), Joi.string());
const artilleryBooleanOrString = Joi.alternatives(Joi.boolean(), Joi.string());

module.exports = {
  artilleryNumberOrString,
  artilleryBooleanOrString
};
