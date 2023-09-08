const Joi = require('joi').defaults((schema) =>
  schema.options({ allowUnknown: true, abortEarly: true })
);
const { HttpConfigSchema } = require('./engines/http');
const { WsConfigSchema } = require('./engines/websocket');
const { ExpectPluginConfigSchema } = require('./plugins/expect');
const { EnsurePluginConfigSchema } = require('./plugins/ensure');
const { ApdexPluginConfigSchema } = require('./plugins/apdex');
const {
  MetricsByEndpointPluginConfigSchema
} = require('./plugins/metrics-by-endpoint');
const {
  PublishMetricsPluginConfigSchema
} = require('./plugins/publish-metrics');

const artilleryStringNumber = Joi.alternatives(Joi.number(), Joi.string());

const TlsConfig = Joi.object({
  rejectUnauthorized: Joi.boolean().meta({
    title:
      'Set this setting to `false` to tell Artillery to accept self-signed TLS certificates.'
  })
});

const TestPhaseWithArrivals = Joi.object({
  name: Joi.string().meta({ title: 'Test Phase Name' }),
  duration: artilleryStringNumber
    .meta({ title: 'Test Phase Duration' })
    .description(
      'Test phase duration (in seconds).\nCan also be any valid human-readable duration: https://www.npmjs.com/package/ms .'
    ),
  arrivalRate: artilleryStringNumber
    .meta({ title: 'Arrival Rate' })
    .description(
      'Constant arrival rate.\nThe number of virtual users generated every second.'
    ),
  arrivalCount: artilleryStringNumber
    .meta({ title: 'Arrival Count' })
    .description(
      'Fixed number of virtual users over that time period.\nhttps://www.artillery.io/docs/reference/test-script#fixed-number-of-arrivals-per-second'
    ),
  rampTo: artilleryStringNumber
    .meta({ title: 'Ramp up rate' })
    .description(
      'Ramp from initial arrivalRate to this value over time period.\nhttps://www.artillery.io/docs/reference/test-script#ramp-up-rate'
    ),
  maxVusers: artilleryStringNumber
    .meta({ title: 'Maximum virtual users' })
    .description(
      'Cap the number of concurrent virtual users at any given time.'
    )
});

const TestPhaseWithPause = Joi.object({
  name: Joi.string().meta({ title: 'Test Phase Name' }),
  pause: artilleryStringNumber
    .meta({ title: 'Pause' })
    .description(
      'Pause the test phase execution for given duration (in seconds).\nCan also be any valid human-readable duration: https://www.npmjs.com/package/ms.'
    )
});

const TestPhase = Joi.alternatives(
  TestPhaseWithArrivals,
  TestPhaseWithPause
).meta({ title: 'Test Phase' });

//TODO: review this one
const PayloadConfig = Joi.object({
  path: Joi.string(),
  fields: Joi.array().items(Joi.string()),
  random: Joi.alternatives('random', 'sequence'),
  skipHeader: Joi.boolean(),
  delimiter: Joi.string(),
  cast: Joi.boolean(),
  skipEmptyLines: Joi.boolean()
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
  'publish-metrics': PublishMetricsPluginConfigSchema
};

const ConfigSchema = Joi.object({
  ...ReplaceableConfig,
  http: HttpConfigSchema.meta({ title: 'HTTP Configuration' }),
  ws: WsConfigSchema.meta({ title: 'Websocket Configuration' }),
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
    ), //TODO: add a few like expect here
  engines: Joi.object()
    .meta({ title: 'Engines' })
    .description('Configuration for specific engines used'), //TODO: add config for a few engines like Playwright
  ...ArtilleryBuiltInPlugins
});

module.exports = {
  ConfigSchema
};
