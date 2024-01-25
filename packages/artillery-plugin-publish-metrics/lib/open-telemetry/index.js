'use strict';

const debug = require('debug')('plugin:publish-metrics:open-telemetry');

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
  constructor(config, events, script) {
    this.config = config;
    this.script = script;
    this.events = events;
    this.engines = new Set();

    this.getEngines(this.script.scenarios || []);

    // Setting resources here as they are used by both metrics and traces and need to be set in a central place where OTel setup is initialised and before any data is generated
    this.resource = Resource.default().merge(
      new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]:
          config.serviceName || 'Artillery-test'
      })
    );

    // HANDLING METRICS
    if (config.metrics) {
      const { OTelMetricsReporter } = require('./metrics');
      this.metricReporter = new OTelMetricsReporter(
        config.metrics,
        this.events,
        this.resource
      );
    }

    // HANDLING TRACES
    if (config.traces) {
      // OpenTelemetry trace setup that is shared between engines - it is set in a separate class so it doesn't get duplicated in case both engines are used in a test
      const { OTelTraceConfig } = require('./tracing/base');
      this.traceConfig = new OTelTraceConfig(config.traces, this.resource);
      this.traceConfig.configure();

      // Run HTTP engine tracing
      if (this.engines.has('http')) {
        const { OTelHTTPTraceReporter } = require('./tracing/http');
        this.httpReporter = new OTelHTTPTraceReporter(config.traces, script);
        this.httpReporter.run();
      }

      // Run Playwright tracing
      if (this.engines.has('playwright')) {
        const { OTelPlaywrightTraceReporter } = require('./tracing/playwright');
        this.playwrightReporter = new OTelPlaywrightTraceReporter(
          config.traces,
          script
        );
        this.playwrightReporter.run();
      }
    }
  }

  // Create set of all engines used in test -> even though we only support Playwright and HTTP engine for now this is future compatible
  getEngines(scenarios) {
    scenarios.forEach((scenario) => {
      scenario.engine
        ? this.engines.add(scenario.engine)
        : this.engines.add('http');
    });
  }

  async cleanup(done) {
    debug('Cleaning up');
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
    await new Promise((resolve) => setTimeout(resolve, 10000));
    await this.traceConfig.shutDown();
    return done();
  }
}

function createOTelReporter(config, events, script) {
  return new OTelReporter(config, events, script);
}

module.exports = {
  createOTelReporter
};
