const Joi = require('joi');

const MetricsByEndpointPluginConfigSchema = Joi.object({
  useOnlyRequestNames: Joi.boolean(),
  stripQueryString: Joi.boolean(),
  ignoreUnnamedRequests: Joi.boolean(),
  metricsPrefix: Joi.string()
}).unknown(false);

module.exports = {
  MetricsByEndpointPluginConfigSchema
};
