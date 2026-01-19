const Joi = require('joi');

const {
  artilleryNumberOrString,
  artilleryBooleanOrString
} = require('../joi.helpers');

//TODO: type internal properties of each reporter

const CloudwatchReporterSchema = Joi.object({
  type: Joi.string().valid('cloudwatch').required(),
  region: Joi.string(),
  namespace: Joi.string(),
  name: Joi.string(),
  dimensions: Joi.array().items(
    Joi.object({
      name: Joi.string().required(),
      value: Joi.string().required()
    })
  ),
  includeOnly: Joi.array().items(Joi.string()),
  excluded: Joi.array().items(Joi.string()),
  sendOnlyTraces: artilleryBooleanOrString,
  traces: Joi.object({
    serviceName: Joi.string(),
    sampleRate: artilleryNumberOrString,
    useRequestNames: artilleryBooleanOrString,
    annotations: Joi.object().unknown(),
    // smartSampling is still technically configured in the reporters so I am adding it here, even though there is an ongoing discussion to move this to the engine level.
    smartSampling: Joi.object({
      thresholds: Joi.object({
        firstByte: artilleryNumberOrString,
        total: artilleryNumberOrString
      })
    }),
    replaceSpanNameRegex: Joi.array().items(
      Joi.object({
        pattern: Joi.string().required(),
        as: Joi.string().required()
      })
    )
  })
})
  .unknown(false)
  .meta({ title: 'Cloudwatch Reporter' });

const DatadogReporterSchema = Joi.object({
  type: Joi.string().valid('datadog').required(),
  apiKey: Joi.string(),
  appKey: Joi.string(),
  apiHost: Joi.string(),
  prefix: Joi.string(),
  tags: Joi.array().items(Joi.string()),
  includeOnly: Joi.array().items(Joi.string()),
  excluded: Joi.array().items(Joi.string()),
  event: Joi.object({
    title: Joi.string(),
    text: Joi.string(),
    priority: Joi.string().valid('normal', 'low'),
    tags: Joi.array().items(Joi.string()),
    alertType: Joi.string().valid('error', 'warning', 'info', 'success'),
    send: artilleryBooleanOrString
  }),
  sendOnlyTraces: artilleryBooleanOrString,
  traces: Joi.object({
    serviceName: Joi.string(),
    sampleRate: artilleryNumberOrString,
    useRequestNames: artilleryBooleanOrString,
    tags: Joi.array().items(Joi.string()),
    smartSampling: Joi.object({
      thresholds: Joi.object({
        firstByte: artilleryNumberOrString,
        total: artilleryNumberOrString
      })
    }),
    replaceSpanNameRegex: Joi.array().items(
      Joi.object({
        pattern: Joi.string().required(),
        as: Joi.string().required()
      })
    )
  })
})
  .unknown(false)
  .meta({ title: 'Datadog Reporter' });

const NewRelicReporterSchema = Joi.object({
  type: Joi.string().valid('newrelic').required(),
  licenseKey: Joi.string().required(),
  region: Joi.string(),
  prefix: Joi.string(),
  attributes: Joi.array().items(Joi.string()),
  includeOnly: Joi.array().items(Joi.string()),
  excluded: Joi.array().items(Joi.string()),
  event: Joi.object({
    accountId: Joi.string().required(),
    eventType: Joi.string(),
    attributes: Joi.array().items(Joi.string()),
    send: artilleryBooleanOrString
  }),
  sendOnlyTraces: artilleryBooleanOrString,
  traces: Joi.object({
    serviceName: Joi.string(),
    sampleRate: artilleryNumberOrString,
    useRequestNames: artilleryBooleanOrString,
    attributes: Joi.array().items(Joi.string()),
    smartSampling: Joi.object({
      thresholds: Joi.object({
        firstByte: artilleryNumberOrString,
        total: artilleryNumberOrString
      })
    }),
    replaceSpanNameRegex: Joi.array().items(
      Joi.object({
        pattern: Joi.string().required(),
        as: Joi.string().required()
      })
    )
  })
})
  .unknown(false)
  .meta({ title: 'New Relic Reporter' });

const SplunkReporterSchema = Joi.object({
  type: Joi.string().valid('splunk').required(),
  accessToken: Joi.string().required(),
  realm: Joi.string(),
  prefix: Joi.string(),
  dimensions: Joi.array().items(Joi.string()),
  includeOnly: Joi.array().items(Joi.string()),
  excluded: Joi.array().items(Joi.string()),
  event: Joi.object({
    eventType: Joi.string(),
    dimensions: Joi.array().items(Joi.string()),
    properties: Joi.array().items(Joi.string()),
    send: artilleryBooleanOrString
  })
})
  .unknown(false)
  .meta({ title: 'Splunk Reporter' });

const PrometheusReporterSchema = Joi.object({
  type: Joi.string().valid('prometheus').required(),
  pushgateway: Joi.string().required(),
  tags: Joi.array().items(Joi.string())
})
  .unknown(false)
  .meta({ title: 'Prometheus (Pushgateway) Reporter' });

const DynatraceReporterSchema = Joi.object({
  type: Joi.string().valid('dynatrace').required(),
  apiToken: Joi.string().required(),
  envUrl: Joi.string().required(),
  prefix: Joi.string(),
  dimensions: Joi.array().items(Joi.string()),
  includeOnly: Joi.array().items(Joi.string()),
  excluded: Joi.array().items(Joi.string()),
  event: Joi.object({
    eventType: Joi.string(),
    title: Joi.string(),
    properties: Joi.array().items(Joi.string()),
    entitySelector: artilleryBooleanOrString,
    send: artilleryBooleanOrString
  }),
  sendOnlyTraces: artilleryBooleanOrString,
  traces: Joi.object({
    serviceName: Joi.string(),
    sampleRate: artilleryNumberOrString,
    useRequestNames: artilleryBooleanOrString,
    attributes: Joi.array().items(Joi.string()),
    smartSampling: Joi.object({
      thresholds: Joi.object({
        firstByte: artilleryNumberOrString,
        total: artilleryNumberOrString
      })
    }),
    replaceSpanNameRegex: Joi.array().items(
      Joi.object({
        pattern: Joi.string().required(),
        as: Joi.string().required()
      })
    )
  })
})
  .unknown(false)
  .meta({ title: 'Dynatrace Reporter' });

const HoneycombReporterSchema = Joi.object({
  type: Joi.string().valid('honeycomb').required(),
  apiKey: Joi.string(), //TODO: add required between these
  writeKey: Joi.string(),
  dataset: Joi.string(),
  sampleRate: artilleryNumberOrString,
  enabled: artilleryBooleanOrString,
  useRequestNames: artilleryBooleanOrString,
  attributes: Joi.object().unknown(),
  smartSampling: Joi.object({
    thresholds: Joi.object({
      firstByte: artilleryNumberOrString,
      total: artilleryNumberOrString
    })
  }),
  replaceSpanNameRegex: Joi.array().items(
    Joi.object({
      pattern: Joi.string().required(),
      as: Joi.string().required()
    })
  )
})
  .unknown(false)
  .meta({ title: 'Honeycomb (Tracing) Reporter' });

const MixpanelReporterSchema = Joi.object({
  type: Joi.string().valid('mixpanel').required(),
  projectToken: Joi.string().required()
})
  .unknown(false)
  .meta({ title: 'Mixpanel Reporter' });

const StatsdReporterSchema = Joi.object({
  type: Joi.string().valid('statsd').required(),
  host: Joi.string(),
  port: artilleryNumberOrString,
  prefix: Joi.string()
})
  .unknown(false)
  .meta({ title: 'StatsD Reporter' });

const InfluxReporterSchema = Joi.object({
  type: Joi.string().valid('influxdb-statsd').required(),
  prefix: Joi.string(),
  tags: Joi.array().items(Joi.string()),
  event: Joi.object({
    priority: Joi.string().valid('normal', 'low'),
    tags: Joi.array().items(Joi.string())
  })
})
  .unknown(false)
  .meta({ title: 'InfluxDB/Telegraf Reporter' });

const OtelCommonOptions = {
  endpoint: Joi.string(),
  headers: Joi.object().unknown()
};

const OpenTelemetryReporterSchema = Joi.object({
  type: Joi.string().valid('open-telemetry').required(),
  serviceName: Joi.string(),
  metrics: Joi.object({
    ...OtelCommonOptions,
    exporter: Joi.string()
      .valid('otlp-http', 'otlp-proto', 'otlp-grpc')
      .default('otlp-http'),
    includeOnly: Joi.array().items(Joi.string()),
    excluded: Joi.array().items(Joi.string()),
    attributes: Joi.object().unknown()
  }),
  traces: Joi.object({
    ...OtelCommonOptions,
    exporter: Joi.string()
      .valid('otlp-http', 'otlp-proto', 'otlp-grpc', 'zipkin')
      .default('otlp-http'),
    sampleRate: artilleryNumberOrString,
    useRequestNames: artilleryBooleanOrString,
    attributes: Joi.object().unknown(),
    smartSampling: Joi.object({
      thresholds: Joi.object({
        firstByte: artilleryNumberOrString,
        total: artilleryNumberOrString
      })
    }),
    replaceSpanNameRegex: Joi.array().items(
      Joi.object({
        pattern: Joi.string().required(),
        as: Joi.string().required()
      })
    )
  })
})
  .unknown(false)
  .meta({ title: 'OpenTelemetry Reporter' });

const PublishMetricsPluginConfigSchema = Joi.array()
  .items(
    Joi.alternatives()
      .try(
        CloudwatchReporterSchema,
        DatadogReporterSchema,
        NewRelicReporterSchema,
        SplunkReporterSchema,
        PrometheusReporterSchema,
        DynatraceReporterSchema,
        HoneycombReporterSchema,
        MixpanelReporterSchema,
        StatsdReporterSchema,
        InfluxReporterSchema,
        OpenTelemetryReporterSchema
      )
      .match('one')
  )
  .meta({ title: 'Publish Metrics Plugin' });

module.exports = {
  PublishMetricsPluginConfigSchema
};
