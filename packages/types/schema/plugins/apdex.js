const Joi = require('joi');

const { artilleryStringNumber } = require('../joi.helpers');

const ApdexPluginConfigSchema = Joi.object({
  threshold: artilleryStringNumber
}).unknown(false);

module.exports = {
  ApdexPluginConfigSchema
};
