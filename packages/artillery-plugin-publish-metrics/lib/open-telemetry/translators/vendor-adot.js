'use strict';

const ADOTSupportedTraceReporters = ['datadog', 'cloudwatch'];
const ADOTSupportedMetricReporters = [];

// Getting the relevant reporter configurations from full publish-metrics configuration

function getADOTRelevantReporterConfigs(publishMetricsConfig) {
  const configs = publishMetricsConfig.filter(
    (reporterConfig) =>
      (ADOTSupportedTraceReporters.includes(reporterConfig.type) &&
        reporterConfig.traces) ||
      (ADOTSupportedMetricReporters.includes(reporterConfig.type) &&
        reporterConfig.metrics)
  );

  return configs;
}

// Resolve the configuration settings for ADOT

function resolveADOTConfigSettings(options) {
  try {
    const adotConfig = getADOTConfig(options.configList); // options.configList ( array of those reporter configurations from publish-metrics config that require ADOT )
    const adotEnvVars = getADOTEnvVars(options.configList, options.dotenv); // options.dotenv (object with environment variables from user provided dotenv file)
    return { adotConfig, adotEnvVars };
  } catch (err) {
    throw new Error(err);
  }
}

// Assembling the configuration for ADOT (in OTel Collector format)

function getADOTConfig(adotRelevantConfigs) {
  const translatedVendorConfigs = adotRelevantConfigs.map((config) =>
    vendorToCollectorConfigTranslators[config.type](config)
  );

  // Different vendors can be used for metrics and tracing so we need to merge configs from each vendor into one collector config
  const finalADOTConfig = JSON.parse(JSON.stringify(collectorConfigTemplate));

  translatedVendorConfigs.forEach((config) => {
    finalADOTConfig.processors = Object.assign(
      finalADOTConfig.processors,
      config.processors
    );
    finalADOTConfig.exporters = Object.assign(
      finalADOTConfig.exporters,
      config.exporters
    );
    finalADOTConfig.service.pipelines = Object.assign(
      finalADOTConfig.service.pipelines,
      config.service.pipelines
    );
  });
  return finalADOTConfig;
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
    const collectorConfig = JSON.parse(JSON.stringify(collectorConfigTemplate));
    if (config.traces) {
      collectorConfig.processors['batch/trace'] = {
        timeout: '2s',
        send_batch_size: 200
      };
      collectorConfig.exporters['datadog/api'] = {
        traces: {
          trace_buffer: 200
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
  },
  cloudwatch: (config) => {
    const collectorConfig = JSON.parse(JSON.stringify(collectorConfigTemplate));
    if (config.traces) {
      collectorConfig.processors['batch/trace'] = {
        timeout: '2s',
        send_batch_max_size: 1024,
        send_batch_size: 200
      };
      collectorConfig.exporters['awsxray'] = {
        region: config.region || 'us-east-1',
        index_all_attributes: 'true'
      };

      collectorConfig.service.pipelines.traces = {
        receivers: ['otlp'],
        processors: ['batch/trace'],
        exporters: ['awsxray']
      };
    }
    return collectorConfig;
  }
};

// Handling vendor specific environment variables needed for ADOT configuration  (e.g. Authentication keys/tokens that can be provided in the script )

function getADOTEnvVars(adotRelevantconfigs, dotenv) {
  const envVars = {};
  try {
    adotRelevantconfigs.forEach((config) => {
      if (vendorSpecificEnvVarsForCollector[config.type]) {
        const vendorVars = vendorSpecificEnvVarsForCollector[config.type](
          config,
          dotenv
        );
        Object.assign(envVars, vendorVars);
      }
    });
  } catch (err) {
    // We warn here instead of throwing because in the future we will support providing these variables through secrets
    console.warn(err.message);
  }
  return envVars;
}

const vendorSpecificEnvVarsForCollector = {
  datadog: (config, dotenv) => {
    const apiKey = config.apiKey || dotenv?.DD_API_KEY;
    // We validate API key here for Datadog (for now) because it is only required if Datadog tracing is set with test running on Fargate. (for local runs user configures their own agent, and for metrics if apiKey is not provided the reporter defaults to sending data to agent)
    if (!apiKey) {
      throw new Error(
        "Datadog reporter Error: Missing Datadog API key. Provide it under 'apiKey' setting in your script or under 'DD_API_KEY' environment variable set in your dotenv file."
      );
    }
    return { DD_API_KEY: apiKey };
  }
};

module.exports = {
  getADOTRelevantReporterConfigs,
  resolveADOTConfigSettings,
  // All func and vars below exported for testing purposes
  getADOTEnvVars,
  vendorSpecificEnvVarsForCollector,
  getADOTConfig,
  vendorToCollectorConfigTranslators,
  ADOTSupportedTraceReporters,
  ADOTSupportedMetricReporters,
  collectorConfigTemplate
};
