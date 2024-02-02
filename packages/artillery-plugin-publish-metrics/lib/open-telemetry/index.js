'use strict';

const debug = require('debug')('plugin:publish-metrics:open-telemetry');
const vendorTranslators = require('./vendor-translators');
const {
  diag,
  DiagConsoleLogger,
  DiagLogLevel,
  context
} = require('@opentelemetry/api');
const { Resource } = require('@opentelemetry/resources');
const {
  SemanticResourceAttributes
} = require('@opentelemetry/semantic-conventions');
const {
  AsyncLocalStorageContextManager
} = require('@opentelemetry/context-async-hooks');

// Setting the contextManager here as it needs to be set globally on the context before anything else
const contextManager = new AsyncLocalStorageContextManager();
contextManager.enable();
context.setGlobalContextManager(contextManager);

// DEBUGGING SETUP - setting the OpenTelemetry's internal diagnostic handler here to run when debug is enabled
if (
  process.env.DEBUG &&
  process.env.DEBUG === 'plugin:publish-metrics:open-telemetry'
) {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);
}

class OTelReporter {
  constructor(configList, events, script) {
    this.script = script;
    this.events = events;
    this.engines = new Set();

    this.translatedConfigsList = configList.map((config) => {
      // Translate the vendor-specific config to OpenTelemetry config
      const translatedConfig = this.translateToOtel(config);

      // Setting serviceName to first serviceName configured
      if (!this.serviceName && translatedConfig.serviceName) {
        this.serviceName = translatedConfig.serviceName;
      }

      // Setting traces to first traces configured
      if (translatedConfig.traces && !this.tracesConfig) {
        this.tracesConfig = translatedConfig.traces;
      }

      // Setting metrics to first metrics configured
      if (translatedConfig.metrics && !this.metricsConfig) {
        this.metricsConfig = translatedConfig.metrics;
      }
      return translatedConfig;
    });

    if (!this.metricsConfig && !this.tracesConfig) {
      return this;
    }

    // Warn if traces are configured in multiple reporters
    this.warnIfDuplicateTracesConfigured(this.translatedConfigsList);

    // Create set of all engines used in test -> even though we only support Playwright and HTTP engine for now this is future compatible
    this.getEngines(this.script.scenarios || []);

    // Setting resources here as they are used by both metrics and traces and need to be set in a central place where OTel setup is initialised and before any data is generated
    this.resource = Resource.default().merge(
      new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]:
          this.serviceName || 'Artillery-test'
      })
    );

    // HANDLING METRICS
    if (this.metricsConfig) {
      const { OTelMetricsReporter } = require('./metrics');
      this.metricReporter = new OTelMetricsReporter(
        this.metricsConfig,
        this.events,
        this.resource
      );
    }

    // HANDLING TRACES
    if (this.tracesConfig) {
      // OpenTelemetry trace setup that is shared between engines - it is set in a separate class so it doesn't get duplicated in case both engines are used in a test
      const { OTelTraceConfig } = require('./tracing/base');
      this.trace = new OTelTraceConfig(this.tracesConfig, this.resource);
      this.trace.configure();

      // Run HTTP engine tracing
      if (this.engines.has('http')) {
        const { OTelHTTPTraceReporter } = require('./tracing/http');
        this.httpReporter = new OTelHTTPTraceReporter(
          this.tracesConfig,
          script
        );
        this.httpReporter.run();
      }

      // Run Playwright tracing
      if (this.engines.has('playwright')) {
        const { OTelPlaywrightTraceReporter } = require('./tracing/playwright');
        this.playwrightReporter = new OTelPlaywrightTraceReporter(
          this.tracesConfig,
          script
        );
        this.playwrightReporter.run();
      }
    }
  }
  warnIfDuplicateTracesConfigured(configList) {
    const tracesConfigs = configList.filter((config) => config.traces);
    if (tracesConfigs.length > 1) {
      console.warn(
        'WARNING: Multiple reporters configured for traces. Currently, you can only use one reporter at a time for reporting traces. Only the first reporter will be used.'
      );
    }
  }
  translateToOtel(config) {
    return vendorTranslators[config.type](config);
  }

  getEngines(scenarios) {
    scenarios.forEach((scenario) => {
      scenario.engine
        ? this.engines.add(scenario.engine)
        : this.engines.add('http');
    });
  }

  async cleanup(done) {
    debug('Cleaning up');
    if (!this.metricsConfig && !this.tracesConfig) {
      return done();
    }
    if (this.metricReporter) {
      await this.metricReporter.cleanup();
    }

    if (!this.httpReporter && !this.playwrightReporter) {
      return done();
    }
    if (this.httpReporter) {
      await this.httpReporter.cleanup('http');
    }
    if (this.playwrightReporter) {
      await this.playwrightReporter.cleanup('playwright');
    }
    await this.trace.shutDown();
    return done();
  }
}

function createOTelReporter(config, events, script) {
  return new OTelReporter(config, events, script);
}

module.exports = {
  createOTelReporter
};
