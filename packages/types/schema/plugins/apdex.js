const Joi = require('joi');

const artilleryStringNumber = Joi.alternatives(Joi.number(), Joi.string());

const ApdexPluginConfigSchema = Joi.object({
  threshold: artilleryStringNumber
}).unknown(false);

module.exports = {
  ApdexPluginConfigSchema
};
