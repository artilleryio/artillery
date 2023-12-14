const Joi = require('joi');

const { artilleryBooleanOrString } = require('../joi.helpers');

//TODO: type internal properties of this plugin

const MetricsByEndpointPluginConfigSchema = Joi.object({
  useOnlyRequestNames: artilleryBooleanOrString,
  stripQueryString: artilleryBooleanOrString,
  ignoreUnnamedRequests: artilleryBooleanOrString,
  metricsNamespace: Joi.string()
})
  .unknown(false)
  .meta({ title: 'Metrics by Endpoint Plugin' });

module.exports = {
  MetricsByEndpointPluginConfigSchema
};
