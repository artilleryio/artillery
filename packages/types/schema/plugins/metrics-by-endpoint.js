const Joi = require('joi');

const { artilleryBooleanOrString } = require('../joi.helpers');

const MetricsByEndpointPluginConfigSchema = Joi.object({
  useOnlyRequestNames: artilleryBooleanOrString
    .meta({ title: 'Use Only Request Names' })
    .description(
      'Use request name property as endpoint name instead of the full URL. Recommended for dynamic URLs.'
    )
    .default(false),
  stripQueryString: artilleryBooleanOrString
    .meta({ title: 'Strip Query String' })
    .description('Strip query strings from the endpoint name automatically.')
    .default(false),
  ignoreUnnamedRequests: artilleryBooleanOrString
    .meta({ title: 'Ignore Unnamed Requests' })
    .description(
      'Ignore per-endpoint metrics for requests without a name property set.'
    )
    .default(false),
  metricsNamespace: Joi.string()
    .meta({ title: 'Metrics Namespace' })
    .description('Custom prefix to use for metrics published by this plugin.')
    .default('plugins.metrics-by-endpoint'),
  groupDynamicURLs: Joi.boolean()
    .default(true)
    .meta({ title: 'Group Dynamic URLs' })
    .description('Group metrics by the non-templated request URL.')
})
  .unknown(false)
  .meta({ title: 'Metrics by Endpoint Plugin' })
  .description(
    'Visualise metrics per endpoint visited during your HTTP test. Docs: https://www.artillery.io/docs/reference/extensions/metrics-by-endpoint\nNote: this plugin is enabled by default, and will display per endpoint metrics in the report. If you want to see them in the console, enable it manually.'
  );

module.exports = {
  MetricsByEndpointPluginConfigSchema
};
