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
    const newConfig = config;
    newConfig.serviceName = config.dataset;

    return otelTemplate(newConfig, honeycombTraceSettings);
  },
  newrelic: (config) => {
    const newRelicTraceSettings = {
      type: 'newrelic',
      // TODO Add options for fed ramp and infinite tracing?
      endpoint:
        config.region.toLowerCase() === 'eu'
          ? 'https://otlp.eu01.nr-data.net/v1/traces'
          : 'https://otlp.nr-data.net/v1/traces',
      headers: {
        'api-key': config.licenseKey
      }
    };
    return otelTemplate(config, newRelicTraceSettings);
  },
  datadog: (config) => {
    const datadogTraceSettings = {
      type: 'datadog'
    };
    const newConfig = config;
    if (config.traces && config.traces.tags) {
      newConfig.traces.attributes = {};
      config.traces.tags.forEach((tag) => {
        const [key, value] = tag.split(':');
        newConfig.traces.attributes[key] = value;
      });
    }
    return otelTemplate(newConfig, datadogTraceSettings);
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

module.exports = vendorTranslators;
