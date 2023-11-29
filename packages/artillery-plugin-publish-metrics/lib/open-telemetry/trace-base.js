'use strict';

const debug = require('debug')('plugin:publish-metrics:open-telemetry');
const grpc = require('@grpc/grpc-js');
const { traceExporters } = require('./exporters');
const {
  BasicTracerProvider,
  TraceIdRatioBasedSampler,
  ParentBasedSampler,
  BatchSpanProcessor
} = require('@opentelemetry/sdk-trace-base');

class OTelTraceConfig {
  constructor(config, resource) {
    this.config = config;
    this.resource = resource;
    this.exporters = traceExporters;
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

    this.exporter = this.exporters[this.config.exporter || 'otlp-http'](
      this.exporterOpts
    );

    this.tracerProvider.addSpanProcessor(
      new BatchSpanProcessor(this.exporter, {
        scheduledDelayMillis: 4000
      })
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

module.exports = {
  OTelTraceConfig
};
