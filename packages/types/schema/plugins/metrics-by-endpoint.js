const Joi = require('joi');

const { artilleryBooleanOrString } = require('../joi.helpers');

//TODO: type internal properties of this plugin

const MetricsByEndpointPluginConfigSchema = Joi.object({
  useOnlyRequestNames: artilleryBooleanOrString,
  stripQueryString: artilleryBooleanOrString,
  ignoreUnnamedRequests: artilleryBooleanOrString,
  metricsPrefix: Joi.string()
}).unknown(false);

module.exports = {
  MetricsByEndpointPluginConfigSchema
};
