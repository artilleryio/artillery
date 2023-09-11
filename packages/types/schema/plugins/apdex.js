const Joi = require('joi');

const { artilleryNumberOrString } = require('../joi.helpers');

const ApdexPluginConfigSchema = Joi.object({
  threshold: artilleryNumberOrString
}).unknown(false);

module.exports = {
  ApdexPluginConfigSchema
};
