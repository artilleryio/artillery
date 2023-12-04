const Joi = require('joi').defaults((schema) =>
  schema.options({ allowUnknown: true, abortEarly: true })
);

const { artilleryBooleanOrString } = require('./joi.helpers');
const { HttpConfigSchema } = require('./engines/http');
const { WsConfigSchema } = require('./engines/websocket');
const { SocketIoConfigSchema } = require('./engines/socketio');
const { PlaywrightConfigSchema } = require('./engines/playwright');
const { ExpectPluginConfigSchema } = require('./plugins/expect');
const { EnsurePluginConfigSchema } = require('./plugins/ensure');
const { ApdexPluginConfigSchema } = require('./plugins/apdex');
const {
  MetricsByEndpointPluginConfigSchema
} = require('./plugins/metrics-by-endpoint');
const {
  PublishMetricsPluginConfigSchema
} = require('./plugins/publish-metrics');
const { FakeDataPlugin } = require('./plugins/fake-data');
const { TestPhase } = require('./config/phases');

const TlsConfig = Joi.object({
  rejectUnauthorized: Joi.boolean().meta({
    title:
      'Set this setting to `false` to tell Artillery to accept self-signed TLS certificates.'
  })
});

const PayloadConfig = Joi.object({
  path: Joi.string().meta({ title: 'CSV Path' }),
  fields: Joi.array()
    .items(Joi.string())
    .meta({ title: 'CSV Fields' })
    .description(
      'List of names of fields to be used in the test to load the data'
    ),
  order: Joi.alternatives('random', 'sequence')
    .meta({ title: 'Order' })
    .description(
      'Controls how the CSV rows are selected for each virtual user.'
    ),
  skipHeader: artilleryBooleanOrString
    .meta({ title: 'Skip Header?' })
    .description(
      'Set to `true` to make Artillery skip the first row in the CSV file (typically the header row)'
    ), //TODO: add default
  delimiter: Joi.string()
    .meta({ title: 'Delimiter' })
    .description('Custom delimiter character to use in the payload.'), //TODO: add default
  cast: artilleryBooleanOrString
    .meta({ title: 'Cast?' })
    .description(
      'Controls whether Artillery converts fields to native types (e.g. numbers or booleans). To keep those fields as strings, set this option to `false`.'
    ),
  skipEmptyLines: artilleryBooleanOrString
    .meta({ title: 'Skip empty lines?' })
    .description(
      'Controls whether Artillery should skip empty lines in the payload.'
    ),
  loadAll: artilleryBooleanOrString
    .meta({ title: 'Load all data' })
    .description('Set loadAll to true to provide all rows to each VU'),
  name: Joi.string()
    .meta({ title: 'Data Name' })
    .description('Name of loadAll data') //TODO: loadAll and name used conditionally
});

const ReplaceableConfig = {
  target: Joi.string()
    .meta({ title: 'Target' })
    .description(
      'Endpoint of the system under test, such as a hostname, IP address or a URI.\nhttps://www.artillery.io/docs/reference/test-script#target---target-service'
    )
    .example('https://example.com')
    .example('ws://127.0.0.1'),
  phases: Joi.array()
    .items(TestPhase)
    .meta({ title: 'Phases' })
    .description(
      'A load phase defines how Artillery generates new virtual users (VUs) in a specified time period.\nhttps://www.artillery.io/docs/reference/test-script#phases---load-phases'
    )
};

const ArtilleryBuiltInPlugins = {
  expect: ExpectPluginConfigSchema,
  ensure: EnsurePluginConfigSchema,
  apdex: ApdexPluginConfigSchema,
  'metrics-by-endpoint': MetricsByEndpointPluginConfigSchema,
  'publish-metrics': PublishMetricsPluginConfigSchema,
  'fake-data': FakeDataPlugin
};

const ArtilleryBuiltInPluginsInRootConfig = (({ ensure, apdex }) => ({
  ensure,
  apdex
}))(ArtilleryBuiltInPlugins);

const ConfigSchema = Joi.object({
  ...ReplaceableConfig,
  http: HttpConfigSchema.meta({ title: 'HTTP Configuration' }),
  ws: WsConfigSchema.meta({ title: 'Websocket Configuration' }),
  socketio: SocketIoConfigSchema.meta({ title: 'SocketIo Configuration' }),
  environments: Joi.object()
    // .rename(/\w\d/, 'something')
    // .pattern(/\w\d/, Joi.object(ReplaceableConfig))//TODO: this isn't working well. Probably a limitation of https://github.com/kenspirit/joi-to-json#known-limitation. Find alternative?
    .meta({ title: 'Environments' })
    .description(
      'Define environments to run your load test against different configs:\nhttps://www.artillery.io/docs/reference/test-script#environments---config-profiles'
    ), //TODO: type this properly

  processor: Joi.string()
    .meta({ title: 'Processor Function Path' })
    .description('Path to a CommonJS module to load for this test run.'),
  variables: Joi.object()
    .meta({ title: 'Variables' })
    .description('Map of variables to expose to the test run.'),
  payload: Joi.alternatives(PayloadConfig, Joi.array().items(PayloadConfig))
    .meta({ title: 'CSV Payload' })
    .description(
      'Load data from CSV to be used during the test run:\nhttps://www.artillery.io/docs/reference/test-script#payload---loading-data-from-csv-files'
    ),
  tls: TlsConfig.meta({ title: 'TLS Settings' }),
  plugins: Joi.object({ ...ArtilleryBuiltInPlugins })
    .meta({ title: 'Plugins' })
    .description(
      'List of Artillery plugins to use (official or third-party) and their configuration'
    ),
  engines: Joi.object({
    playwright: PlaywrightConfigSchema
  })
    .meta({ title: 'Engines' })
    .description('Configuration for specific engines used'),
  ...ArtilleryBuiltInPluginsInRootConfig
});

module.exports = {
  ConfigSchema
};
