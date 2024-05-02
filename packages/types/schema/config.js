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
const { SlackPluginConfigSchema } = require('./plugins/slack');
const { TestPhase } = require('./config/phases');
const { buildArtilleryKeyValue } = require('./joi.helpers');

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

const ArtilleryBuiltInPlugins = {
  expect: ExpectPluginConfigSchema,
  ensure: EnsurePluginConfigSchema,
  apdex: ApdexPluginConfigSchema,
  'metrics-by-endpoint': MetricsByEndpointPluginConfigSchema,
  'publish-metrics': PublishMetricsPluginConfigSchema,
  'fake-data': FakeDataPlugin,
  slack: SlackPluginConfigSchema
};

const ArtilleryBuiltInPluginsInRootConfig = (({ ensure, apdex }) => ({
  ensure,
  apdex
}))(ArtilleryBuiltInPlugins);

const ConfigSchemaWithoutEnvironments = Joi.object({
  target: Joi.string()
    .meta({ title: 'Target' })
    .description(
      'Endpoint of the system under test, such as a hostname, IP address or a URI.\nIn Playwright tests, this will be used as the baseURL by default.\n\nhttps://www.artillery.io/docs/reference/test-script#target---target-service'
    )
    .example('https://example.com')
    .example('ws://127.0.0.1'),
  phases: Joi.array()
    .items(TestPhase)
    .meta({ title: 'Phases' })
    .description(
      'A load phase defines how Artillery generates new virtual users (VUs) in a specified time period.\nhttps://www.artillery.io/docs/reference/test-script#phases---load-phases'
    ),
  http: HttpConfigSchema.meta({ title: 'HTTP Configuration' }),
  ws: WsConfigSchema.meta({ title: 'Websocket Configuration' }),
  socketio: SocketIoConfigSchema.meta({ title: 'SocketIo Configuration' }),
  processor: Joi.string()
    .meta({ title: 'Processor Function Path' })
    .description(
      'Path to a CommonJS (.js), ESM (.mjs) or Typescript (.ts) module to load for this test run.\nhttps://www.artillery.io/docs/reference/test-script#processor---custom-js-code'
    ),
  variables: Joi.object()
    .meta({ title: 'Variables' })
    .description('Map of variables to expose to the test run.'),
  payload: Joi.alternatives(PayloadConfig, Joi.array().items(PayloadConfig))
    .meta({ title: 'CSV Payload' })
    .description(
      'Load data from CSV to be used during the test run:\nhttps://www.artillery.io/docs/reference/test-script#payload---loading-data-from-csv-files'
    ),
  tls: TlsConfig.meta({ title: 'TLS Settings' }),
  bundling: Joi.object({
    external: Joi.array()
      .items(Joi.string())
      .meta({ title: 'External Packages' })
      .description(
        'Can be used when using Typescript (.ts) processors. List npm modules to prevent them from being bundled. Use in case there are issues with bundling certain packages.\nhttps://www.artillery.io/docs/reference/test-script#preventing-bundling-of-typescript-packages'
      )
  })
    .meta({ title: 'Bundling' })
    .description(
      'Configuration for bundling the test script and its dependencies'
    ),
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
}).id('BaseConfigSchema');

const ConfigSchema = ConfigSchemaWithoutEnvironments.keys({
  environments: buildArtilleryKeyValue(ConfigSchemaWithoutEnvironments)
    .meta({ title: 'Environments' })
    .description(
      'Replace /.*/ with the name of an environment to run your load test against different configs:\nhttps://www.artillery.io/docs/reference/test-script#environments---config-profiles'
    )
});

module.exports = {
  ConfigSchema
};
