'use strict';

// Map of functions that translate vendor-specific configuration to OpenTelemetry configuration
const vendorTranslators = {
  honeycomb: (config) => {
    if (config.enabled === false) {
      return {};
    }
    if (!config.apiKey && !config.writeKey) {
      throw new Error(
        'Honeycomb reporter: apiKey or writeKey must be provided. More info in the docs (https://docs.art/reference/extensions/publish-metrics#honeycomb)'
      );
    }
    const honeycombTraceSettings = {
      type: 'honeycomb',
      endpoint: 'https://api.honeycomb.io/v1/traces',
      headers: {
        'x-honeycomb-team': config.apiKey || config.writeKey
      }
    };
    const newConfig = {};
    newConfig.traces = config;
    newConfig.serviceName = config.dataset;

    return otelTemplate(newConfig, honeycombTraceSettings);
  },
  newrelic: (config) => {
    const newRelicTraceSettings = {
      type: 'newrelic',
      // TODO Add options for fed ramp and infinite tracing?
      endpoint:
        config.region?.toLowerCase() === 'eu'
          ? 'https://otlp.eu01.nr-data.net/v1/traces'
          : 'https://otlp.nr-data.net/v1/traces',
      headers: {
        'api-key': config.licenseKey
      },
      attributes: attributeListToObject(config.traces?.attributes, 'newrelic')
    };

    return otelTemplate(config, newRelicTraceSettings);
  },
  datadog: (config) => {
    const datadogTraceSettings = {
      type: 'datadog',
      attributes: attributeListToObject(config.traces?.tags, 'datadog')
    };
    return otelTemplate(config, datadogTraceSettings);
  },
  dynatrace: (config) => {
    const tracePath = '/api/v2/otlp/v1/traces';
    const endpoint = new URL(config.envUrl);
    endpoint.pathname = tracePath;

    const dynatraceTraceSettings = {
      type: 'dynatrace',
      exporter: 'otlp-proto',
      endpoint: endpoint.href,
      headers: {
        Authorization: `Api-Token ${config.apiToken}`
      },
      attributes: attributeListToObject(config.traces?.attributes, 'dynatrace')
    };
    return otelTemplate(config, dynatraceTraceSettings);
  },
  'open-telemetry': (config) => {
    let tracesConfig = config;
    if (config.traces) {
      tracesConfig.traces.type = 'otel';
    }
    return tracesConfig;
  }
};

const otelTemplate = function (config, vendorSpecificSettings) {
  const otelConfig = {};
  if (config.traces) {
    otelConfig.serviceName = config.traces.serviceName || config.serviceName;
    otelConfig.traces = Object.assign(
      {
        sampleRate: 1,
        useRequestNames: config.traces.useRequestNames,
        attributes: config.traces.attributes,
        smartSampling: config.traces.smartSampling
      },
      vendorSpecificSettings
    );
  }
  return otelConfig;
};

function attributeListToObject(attributeList, reporterType) {
  if (!attributeList || attributeList.length === 0) {
    return;
  }
  const attributes = {};
  try {
    attributeList.forEach((attribute) => {
      const [key, value] = attribute.split(':');
      attributes[key] = value;
    });
  } catch (err) {
    throw new Error(
      `${
        reporterType[0].toUpperCase() + reporterType.slice(1)
      } reporter: Error parsing ${
        reporterType === 'datadog' ? 'tags. Tags' : 'attributes. Attributes'
      } must be a list of strings in the 'key:value' format. More info in the docs (https://docs.artillery.io/reference/extensions/publish-metrics/${reporterType})`
    );
  }

  return attributes;
}

// ADOT collector translation

const ADOTSupportedTraceReporters = ['datadog'];
const ADOTSupportedMetricReporters = [];

const collectorConfigTemplate = {
  receivers: {
    otlp: {
      protocols: {
        http: {
          endpoint: '0.0.0.0:4318'
        },
        grpc: {
          endpoint: '0.0.0.0:4317'
        }
      }
    }
  },
  processors: {},
  exporters: {},
  service: {
    pipelines: {}
  }
};
// Gets a list of publish-metrics reporter configurations and dotenv variables; returns an object with the assembled collector config and environment variables to set
// Reason why we assemble the collector config here is that different vendors can be used for metrics and tracing and we need to merge all the parts of the config from each vendor
function assembleCollectorConfigOpts(reportersConfigList, options) {
  if (reportersConfigList.length === 0) return;

  const adotRelevantConfigs = parseReportersForADOT(reportersConfigList);
  if (adotRelevantConfigs.length === 0) return;

  // For each vendor config return an object with the config translation and environment variables to set if any needed
  const collectorOptionsList = adotRelevantConfigs.map((config) =>
    vendorToCollectorConfigTranslators[config.type](config, options)
  );

  // Assemble the final collector config by adding all parts of the config from each vendor
  const collectorConfig = { ...collectorConfigTemplate };
  collectorOptionsList.forEach((vendorOpts) => {
    collectorConfig.processors = Object.assign(
      collectorConfig.processors,
      vendorOpts.config.processors
    );
    collectorConfig.exporters = Object.assign(
      collectorConfig.exporters,
      vendorOpts.config.exporters
    );
    collectorConfig.service.pipelines = Object.assign(
      collectorConfig.service.pipelines,
      vendorOpts.config.service.pipelines
    );
  });

  // Join required vendor specific environment variables into one object
  const envVars = collectorOptionsList.reduce((acc, vendorOpts) => {
    return Object.assign(acc, vendorOpts.envVars);
  }, {});

  // We need to stringify the collector config as it needs to be set as a parameter value in SSM for ADOT to pick it up
  return {
    configJSON: JSON.stringify(collectorConfig),
    envVars
  };
}

// Map of functions that translate vendor-specific configuration to OpenTelemetry Collector configuration to be used by ADOT
const vendorToCollectorConfigTranslators = {
  datadog: (config, options) => {
    if (!config.traces) return;
    if (
      !options.dotenv?.DD_API_KEY &&
      !config.apiKey &&
      !config.traces.apiKey
    ) {
      throw new Error(
        "Datadog reporter Error: Missing Datadog API key. Provide it under 'apiKey' setting in your script or under 'DD_API_KEY' environment variable set in your dotenv file."
      );
    }
    const envVars = {};
    if (!options.dotenv?.DD_API_KEY) {
      envVars.DD_API_KEY = config.apiKey || config.traces.apiKey;
    }

    const ddTraceConfig = {
      processors: {
        'batch/trace': {
          timeout: '10s',
          send_batch_max_size: 1024,
          send_batch_size: 200
        }
      },
      exporters: {
        'datadog/api': {
          traces: {
            trace_buffer: 100
          },
          api: {
            key: '${env:DD_API_KEY}'
          }
        }
      },
      service: {
        pipelines: {
          traces: {
            receivers: ['otlp'],
            processors: ['batch/trace'],
            exporters: ['datadog/api']
          }
        }
      }
    };
    return { config: ddTraceConfig, envVars };
  }
};

// Parses the full list of reporter configurations and returns a list with the first ADOT relevant reporter configuration per signal type (currently only one reporter per signal type is supported)
function parseReportersForADOT(configList) {
  const configs = [];
  // Get all reporter configurations for tracing supported by ADOT and warn if multiple are set
  const traceConfigs = configList.filter(
    (reporterConfig) =>
      ADOTSupportedTraceReporters.includes(reporterConfig.type) &&
      reporterConfig.traces
  );
  warnIfMultipleReportersPerSignalTypeSet(configList, 'traces');

  // Get all reporter configurations for metrics supported by ADOT and warn if multiple are set
  const metricConfigs = configList.filter(
    (reporterConfig) =>
      ADOTSupportedMetricReporters.includes(reporterConfig.type) &&
      reporterConfig.metrics
  );
  warnIfMultipleReportersPerSignalTypeSet(configList, 'metrics');
  // Return only the first relevant reporter configuration set per signal type
  if (traceConfigs[0]) {
    configs.push(traceConfigs[0]);
  }
  if (metricConfigs[0]) {
    configs.push(metricConfigs[0]);
  }
  return configs;
}

function warnIfMultipleReportersPerSignalTypeSet(configList, signalType) {
  const signalConfigs = configList.filter(
    (reporterConfig) => reporterConfig[signalType]
  );
  if (signalConfigs.length > 1) {
    console.warn(
      `Publish-Metrics: WARNING: Multiple reporters configured for ${signalType}. Currently, you can only use one reporter at a time for reporting ${signalType}. Only the first reporter will be used.`
    );
  }
}

module.exports = {
  vendorTranslators,
  assembleCollectorConfigOpts,
  warnIfMultipleReportersPerSignalTypeSet
};
