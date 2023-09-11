const artilleryStringNumber = Joi.alternatives(Joi.number(), Joi.string());
const artilleryStringBoolean = Joi.alternatives(Joi.boolean(), Joi.string());

module.exports = {
  artilleryStringNumber,
  artilleryStringBoolean
};
