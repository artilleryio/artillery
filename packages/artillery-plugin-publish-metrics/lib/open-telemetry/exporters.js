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
  },
  __test(options) {
    const { FileSpanExporter } = require('./file-span-exporter');
    return new FileSpanExporter(options);
  }
};

function validateExporter(supportedExporters, exporter, type) {
  const supported = Object.keys(supportedExporters).reduce(
    (acc, k, i) =>
      acc + k + (i === Object.keys(supportedExporters).length - 1 ? '.' : ', '),
    ''
  );

  if (exporter && !supportedExporters[exporter]) {
    throw new Error(
      `Open-telemetry reporter: ${
        type[0].toUpperCase() + type.slice(1)
      } exporter ${exporter} is not supported. Currently supported exporters for ${type}s are ${supported}`
    );
  }
}

module.exports = {
  metricExporters,
  traceExporters,
  validateExporter
};
