'use strict';

const debug = require('debug')('plugin:publish-metrics:open-telemetry');
const grpc = require('@grpc/grpc-js');
const { traceExporters, validateExporter } = require('../exporters');
const {
  OutlierDetectionBatchSpanProcessor
} = require('../outlier-detection-processor');

const { SemanticAttributes } = require('@opentelemetry/semantic-conventions');
const {
  BasicTracerProvider,
  TraceIdRatioBasedSampler,
  ParentBasedSampler,
  BatchSpanProcessor
} = require('@opentelemetry/sdk-trace-base');
const { SpanKind, trace } = require('@opentelemetry/api');
const { sleep } = require('../../util');

class OTelTraceConfig {
  constructor(config, resource) {
    this.config = config;
    this.resource = resource;

    // Validate exporter provided by user
    validateExporter(traceExporters, this.config.exporter, 'trace');
  }

  configure() {
    debug('Configuring Tracer Provider');
    this.tracerOpts = {
      resource: this.resource
    };
    if (this.config.sampleRate) {
      this.tracerOpts.sampler = new ParentBasedSampler({
        root: new TraceIdRatioBasedSampler(this.config.sampleRate)
      });
    }

    this.tracerProvider = new BasicTracerProvider(this.tracerOpts);

    debug('Configuring Exporter');
    this.exporterOpts = {};
    if (this.config.endpoint) {
      this.exporterOpts.url = this.config.endpoint;
    }

    if (this.config.headers) {
      if (this.config.exporter && this.config.exporter === 'otlp-grpc') {
        const metadata = new grpc.Metadata();
        Object.entries(this.config.headers).forEach(([k, v]) =>
          metadata.set(k, v)
        );
        this.exporterOpts.metadata = metadata;
      } else {
        this.exporterOpts.headers = this.config.headers;
      }
    }

    this.exporter = traceExporters[this.config.exporter || 'otlp-http'](
      this.exporterOpts
    );

    this.processorOpts = {
      scheduledDelayMillis: this.config.scheduledDelayMillis || 5000,
      maxExportBatchSize: this.config.maxExportBatchSize || 1000,
      maxQueueSize: this.config.maxQueueSize || 2000
    };
    const Processor = this.config.smartSampling
      ? OutlierDetectionBatchSpanProcessor
      : BatchSpanProcessor;

    this.tracerProvider.addSpanProcessor(new Processor(this.exporter));
    this.tracerProvider.register();
  }

  async shutDown() {
    debug('Initiating TracerProvider shutdown');
    try {
      await this.tracerProvider.shutdown();
    } catch (err) {
      debug(err);
    }
    debug('TracerProvider shutdown completed');
  }
}

class OTelTraceBase {
  constructor(config, script) {
    this.config = config;
    this.script = script;
    this.pendingRequestSpans = 0;
    this.pendingScenarioSpans = 0;
    this.pendingPageSpans = 0;
    this.pendingStepSpans = 0;
    this.pendingPlaywrightScenarioSpans = 0;
  }
  setTracer(engine) {
    // Get and set the tracer by engine
    const tracerName = engine + 'Tracer';
    if (!this[tracerName]) {
      this[tracerName] = trace.getTracer(`artillery-${engine}`);
    }
  }
  // Sets the tracer by engine type, starts the scenario span and adds it to the VU context
  startScenarioSpan(engine) {
    return function (userContext, ee, next) {
      const span = this[`${engine}Tracer`].startSpan(
        userContext.scenario?.name || `artillery-${engine}-scenario`,
        {
          startTime: Date.now(),
          kind: SpanKind.CLIENT,
          attributes: {
            'vu.uuid': userContext.vars.$uuid,
            test_id: userContext.vars.$testId,
            [SemanticAttributes.PEER_SERVICE]: this.config.serviceName
          }
        }
      );

      userContext.vars[`__${engine}ScenarioSpan`] = span;
      this.pendingScenarioSpans++;
      if (engine === 'http') {
        next();
      } else {
        return span;
      }
    };
  }

  endScenarioSpan(engine) {
    return function (userContext, ee, next) {
      const span = userContext.vars[`__${engine}ScenarioSpan`];
      if (!span.endTime[0]) {
        span.end(Date.now());
        this.pendingScenarioSpans--;
      }
      if (engine === 'http') {
        next();
      } else {
        return;
      }
    };
  }

  // Placeholder - make onError hook engine agnostic - implement hook for other engines?
  otelTraceOnError(scenarioErr, req, userContext, ee, done) {
    done();
  }
  async waitOnPendingSpans(pendingRequests, pendingScenarios, maxWaitTime) {
    let waitedTime = 0;
    while (
      (pendingRequests > 0 || pendingScenarios > 0) &&
      waitedTime < maxWaitTime
    ) {
      debug('Waiting for pending traces ...');
      await sleep(500);
      waitedTime += 500;
    }
    return true;
  }

  async cleanup(engines) {
    if (engines.includes('http')) {
      await this.waitOnPendingSpans(
        this.pendingRequestSpans,
        this.pendingScenarioSpans,
        5000
      );
    }
    if (engines.includes('playwright')) {
      await this.waitOnPendingSpans(
        this.pendingPlaywrightScenarioSpans,
        this.pendingPlaywrightScenarioSpans,
        5000
      );
    }

    debug('Pending traces done');
    debug('Waiting for flush period to complete');
    await sleep(5000);
  }
}

module.exports = {
  OTelTraceConfig,
  OTelTraceBase
};
