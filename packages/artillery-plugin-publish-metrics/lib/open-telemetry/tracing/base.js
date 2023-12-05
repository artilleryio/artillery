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
    let samplingOpts = this.config.smartSampling;
    const Processor =
      this.config.smartSampling && !this.config.smartSampling?.tagOnly
        ? OutlierDetectionBatchSpanProcessor
        : BatchSpanProcessor;

    this.tracerProvider.addSpanProcessor(
      new Processor(
        this.exporter,
        {
          scheduledDelayMillis: 1000
        },
        samplingOpts
      )
    );
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

  async cleanup() {
    while (this.pendingRequestSpans > 0 || this.pendingScenarioSpans > 0) {
      debug('Waiting for pending traces ...');
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    debug('Pending traces done');
  }
}

module.exports = {
  OTelTraceConfig,
  OTelTraceBase
};
