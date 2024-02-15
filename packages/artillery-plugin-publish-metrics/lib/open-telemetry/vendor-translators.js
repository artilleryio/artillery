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

//////// ADOT COLLECTOR HANDLING

const ADOTSupportedTraceReporters = ['datadog'];
const ADOTSupportedMetricReporters = [];

// Getting the relevant configurations for ADOT from the full list of reporter configurations

function getADOTRelevantReporterConfigs(configList) {
  const configs = configList.filter(
    (reporterConfig) =>
      (ADOTSupportedTraceReporters.includes(reporterConfig.type) &&
        reporterConfig.traces) ||
      (ADOTSupportedMetricReporters.includes(reporterConfig.type) &&
        reporterConfig.metrics)
  );

  return configs.length > 0 ? configs : null;
}

// Handling relevant environment variables

function getADOTEnvVars(adotRelevantconfigs, dotenv) {
  const envVars = {};
  try {
    adotRelevantconfigs.forEach((config) => {
      const vendorVars = vendorSpecificEnvVarsForCollector[config.type](
        config,
        dotenv
      );
      Object.assign(envVars, vendorVars);
    });
  } catch (err) {
    throw new Error(err);
  }
  return envVars;
}

const vendorSpecificEnvVarsForCollector = {
  datadog: (config, dotenv) => {
    const apiKey = config.apiKey || dotenv?.DD_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Datadog reporter Error: Missing Datadog API key. Provide it under 'apiKey' setting in your script or under 'DD_API_KEY' environment variable set in your dotenv file."
      );
    }
    return { DD_API_KEY: apiKey };
  }
};

// Assembling the configuration for ADOT (in OTel Collector format)

// Different vendors can be used for metrics and tracing so we need to merge all the parts of the config from each vendor into one collector config
function assembleCollectorConfig(adotRelevantConfigs) {
  // Translate each vendor-specific config to OpenTelemetry Collector config
  const collectorConfigList = adotRelevantConfigs.map((config) =>
    vendorToCollectorConfigTranslators[config.type](config)
  );

  const collectorConfig = { ...collectorConfigTemplate };
  // Assemble the final collector config by adding all parts of the config from each vendor
  collectorConfigList.forEach((config) => {
    collectorConfig.processors = Object.assign(
      collectorConfig.processors,
      config.processors
    );
    collectorConfig.exporters = Object.assign(
      collectorConfig.exporters,
      config.exporters
    );
    collectorConfig.service.pipelines = Object.assign(
      collectorConfig.service.pipelines,
      config.service.pipelines
    );
  });
  return collectorConfig;
}

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

// Map of functions that translate vendor-specific configuration to OpenTelemetry Collector configuration to be used by ADOT
const vendorToCollectorConfigTranslators = {
  datadog: (config) => {
    const collectorConfig = { ...collectorConfigTemplate };
    if (config.traces) {
      collectorConfig.processors['batch/trace'] = {
        timeout: '10s',
        send_batch_max_size: 1024,
        send_batch_size: 200
      };
      collectorConfig.exporters['datadog/api'] = {
        traces: {
          trace_buffer: 100
        },
        api: {
          key: '${env:DD_API_KEY}'
        }
      };
      collectorConfig.service.pipelines.traces = {
        receivers: ['otlp'],
        processors: ['batch/trace'],
        exporters: ['datadog/api']
      };
    }
    return collectorConfig;
  }
};

// Resolve the configuration settings for ADOT

function resolveADOTConfigSettings(options) {
  try {
    const adotConfig = assembleCollectorConfig(options.configList);
    const adotEnvVars = getADOTEnvVars(options.configList, options.dotenv);
    return { adotConfig, adotEnvVars };
  } catch (err) {
    throw new Error(err);
  }
}

module.exports = {
  vendorTranslators,
  getADOTRelevantReporterConfigs,
  resolveADOTConfigSettings
};
