const { test } = require('tap');

const {
  getADOTRelevantReporterConfigs,
  vendorSpecificEnvVarsForCollector,
  getADOTEnvVars,
  vendorToCollectorConfigTranslators,
  getADOTConfig,
  resolveADOTConfigSettings,
  collectorConfigTemplate
} = require('../../lib/open-telemetry/translators/vendor-adot');

// Test getADOTRelevantReporterConfigs
test('getADOTRelevantReporterConfigs correctly filters out unsupported reporter configurations from a list of reporter configs', async (t) => {
  const pmConfigList = [
    {
      type: 'datadog',
      traces: {}
    },
    {
      type: 'unsupportedVendor',
      traces: {}
    },
    {
      type: 'datadog'
    }
  ];
  const result = getADOTRelevantReporterConfigs(pmConfigList);
  t.same(result, [
    {
      type: 'datadog',
      traces: {}
    }
  ]);
});

test('getADOTRelevantReporterConfigs returns empty list when no relevant reporter configurations are found', async (t) => {
  const pmConfigList = [
    {
      type: 'unsupportedVendor',
      traces: {}
    }
  ];
  const result = getADOTRelevantReporterConfigs(pmConfigList);
  t.same(result, []);
});

test('getADOTRelevantReporterConfigs does not return configuration when the supported signal type is not configured', async (t) => {
  const pmConfigList = [
    {
      type: 'datadog'
    }
  ];
  const result = getADOTRelevantReporterConfigs(pmConfigList);
  t.same(result, []);
});

// Test vendorSpecificEnvVarsForCollector
test('when vendorSpecificEnvVarsForCollector is called with needed parameters, it returns an object with the DD_API_KEY', async (t) => {
  const config = {
    type: 'datadog',
    tracing: {}
  };
  const dotenv = {
    DD_API_KEY: '123'
  };
  const result = vendorSpecificEnvVarsForCollector.datadog(config, dotenv);
  t.same(result, { DD_API_KEY: '123' });
});

test('when vendorSpecificEnvVarsForCollector is called without apiKey or DD_API_KEY, it throws an error', async (t) => {
  const config = {
    type: 'datadog',
    tracing: {}
  };
  const dotenv = {};
  t.throws(() => vendorSpecificEnvVarsForCollector.datadog(config, dotenv), {
    message:
      "Datadog reporter Error: Missing Datadog API key. Provide it under 'apiKey' setting in your script or under 'DD_API_KEY' environment variable set in your dotenv file."
  });
});

test('when vendorSpecificEnvVarsForCollector is called with an apiKey but and an empty dotenv object, it returns an object with the DD_API_KEY', async (t) => {
  const config = {
    type: 'datadog',
    apiKey: '123',
    tracing: {}
  };
  const dotenv = {};
  const result = vendorSpecificEnvVarsForCollector.datadog(config, dotenv);
  t.same(result, { DD_API_KEY: '123' });
});

test('when vendorSpecificEnvVarsForCollector is called with an apiKey and DD_API_KEY, it returns an object with the DD_API_KEY as the apiKey', async (t) => {
  const config = {
    type: 'datadog',
    apiKey: '123',
    tracing: {}
  };
  const dotenv = {
    DD_API_KEY: '456'
  };
  const result = vendorSpecificEnvVarsForCollector.datadog(config, dotenv);
  t.same(result, { DD_API_KEY: '123' });
});

// Test getADOTEnvVars
test('when getADOTEnvVars is called with a list of adotRelevantconfigs and a dotenv, it returns an object with the environment variables for the relevant vendors', async (t) => {
  const adotRelevantconfigs = [
    {
      type: 'datadog',
      tracing: {}
    }
  ];
  const dotenv = {
    DD_API_KEY: '123'
  };
  const result = getADOTEnvVars(adotRelevantconfigs, dotenv);
  t.same(result, { DD_API_KEY: '123' });
});

// Maybe remove throwing an error in the function itself as it propagates to the resolveADOTConfigSettings and then we can handle it there
test('when getADOTEnvVars is called with an unsupported vendor, it throws an error', async (t) => {
  const adotRelevantconfigs = [
    {
      type: 'unsupportedVendor',
      tracing: {}
    }
  ];
  const dotenv = {
    DD_API_KEY: '123'
  };
  t.throws(() => getADOTEnvVars(adotRelevantconfigs, dotenv));
});

test('when getADOTEnvVars is called with an empty list of adotRelevantconfigs and an empty dotenv object it returns an empty object', async (t) => {
  const adotRelevantconfigs = [];
  const dotenv = {};
  const result = getADOTEnvVars(adotRelevantconfigs, dotenv);
  t.same(result, {});
});

// Test vendorToCollectorConfigTranslators
test('when vendorToCollectorConfigTranslators is called with a datadog config, it returns an object with the correct properties', async (t) => {
  const config = {
    type: 'datadog',
    traces: {}
  };
  const result = vendorToCollectorConfigTranslators.datadog(config);
  t.same(result, {
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
  });
});

test('when vendorToCollectorConfigTranslators is called with a datadog config that has no traces configured it returns the collector config template', async (t) => {
  const config = {
    type: 'datadog'
  };
  const result = vendorToCollectorConfigTranslators.datadog(config);
  t.same(result, collectorConfigTemplate);
});

// Test getADOTConfig
test('when getADOTConfig is called with a list of adotRelevantConfigs, it returns an object with the correct properties', async (t) => {
  const adotRelevantConfigs = [
    {
      type: 'datadog',
      traces: {}
    }
  ];
  const result = getADOTConfig(adotRelevantConfigs);
  t.same(result, {
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
  });
});

test('when getADOTConfig is called with an empty list of adotRelevantConfigs, it returns an object that is same as collector config template', async (t) => {
  const adotRelevantConfigs = [];
  const result = getADOTConfig(adotRelevantConfigs);
  t.same(result, collectorConfigTemplate);
});

// Test resolveADOTConfigSettings
test('when resolveADOTConfigSettings is called with a configList and a dotenv object, it returns an object with the correct adotConfig and adotEnvVars', async (t) => {
  const options = {
    configList: [
      {
        type: 'datadog',
        traces: {}
      }
    ],
    dotenv: {
      DD_API_KEY: '123'
    }
  };
  const result = resolveADOTConfigSettings(options);
  t.same(result, {
    adotConfig: {
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
    },
    adotEnvVars: {
      DD_API_KEY: '123'
    }
  });
});
