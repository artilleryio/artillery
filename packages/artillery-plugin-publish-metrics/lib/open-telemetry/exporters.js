'use strict';

const metricExporters = {
  'otlp-proto'(options) {
    const {
      OTLPMetricExporter
    } = require('@opentelemetry/exporter-metrics-otlp-proto');
    return new OTLPMetricExporter(options);
  },
  'otlp-http'(options) {
    const {
      OTLPMetricExporter
    } = require('@opentelemetry/exporter-metrics-otlp-http');
    return new OTLPMetricExporter(options);
  },
  'otlp-grpc'(options) {
    const {
      OTLPMetricExporter
    } = require('@opentelemetry/exporter-metrics-otlp-grpc');
    return new OTLPMetricExporter(options);
  }
};

const traceExporters = {
  'otlp-proto'(options) {
    const {
      OTLPTraceExporter
    } = require('@opentelemetry/exporter-trace-otlp-proto');
    return new OTLPTraceExporter(options);
  },
  'otlp-http'(options) {
    const {
      OTLPTraceExporter
    } = require('@opentelemetry/exporter-trace-otlp-http');
    return new OTLPTraceExporter(options);
  },
  'otlp-grpc'(options) {
    const {
      OTLPTraceExporter
    } = require('@opentelemetry/exporter-trace-otlp-grpc');
    return new OTLPTraceExporter(options);
  },
  zipkin(options) {
    const { ZipkinExporter } = require('@opentelemetry/exporter-zipkin');
    return new ZipkinExporter(options);
  }
};

module.exports = {
  metricExporters,
  traceExporters
};
