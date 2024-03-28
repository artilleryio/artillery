'use strict';

// Map of functions that translate vendor-specific reporter configuration to OpenTelemetry reporter configuration
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
    let newConfig = config;
    if (config.traces) {
      newConfig.traces.type = 'open-telemetry';
    }
    if (config.metrics) {
      newConfig.metrics.type = 'open-telemetry';
    }
    return newConfig;
  },
  cloudwatch: (config) => {
    const cloudwatchTraceSettings = {
      type: 'cloudwatch',
      attributes: config.traces?.annotations
    };
    return otelTemplate(config, cloudwatchTraceSettings);
  }
};

const otelTemplate = function (config, vendorSpecificSettings) {
  const otelConfig = {};
  if (config.traces) {
    otelConfig.serviceName = config.traces.serviceName || config.serviceName;
    otelConfig.traces = Object.assign(
      {
        sampleRate: config.traces.sampleRate,
        useRequestNames: config.traces.useRequestNames,
        attributes: config.traces.attributes,
        smartSampling: config.traces.smartSampling,
        replaceSpanNameRegex: config.traces.replaceSpanNameRegex
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

module.exports = {
  vendorTranslators
};
