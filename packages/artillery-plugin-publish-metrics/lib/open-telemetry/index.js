'use strict';

const debug = require('debug')('plugin:publish-metrics:otel');
const { attachScenarioHooks } = require('../util');

const { trace } = require('@opentelemetry/api');

const { Resource } = require('@opentelemetry/resources');
const {
  SemanticResourceAttributes
} = require('@opentelemetry/semantic-conventions');

class OTelReporter {
  constructor(config, events, script) {
    this.script = script;
    this.events = events;
    this.protocols = {
      'http-proto': 'proto',
      'http-json': 'http'
    };

    this.resource = Resource.default().merge(
      new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]:
          config.serviceName || 'Artillery-test'
      })
    );

    if (config.traces) {
      this.tracing = true;
      this.traceConfig = config.traces;

      this.configureTrace(this.traceConfig);

      attachScenarioHooks(script, [
        {
          type: 'beforeRequest',
          name: 'startOTelSpan',
          hook: this.startOTelSpan.bind(this)
        }
      ]);

      attachScenarioHooks(script, [
        {
          type: 'afterResponse',
          name: 'exportOTelSpan',
          hook: this.exportOTelSpan.bind(this)
        }
      ]);
    }
  }

  configureTrace(config) {
    debug('Configuring Tracer Provider');
    const {
      BasicTracerProvider,
      TraceIdRatioBasedSampler,
      ParentBasedSampler,
      BatchSpanProcessor
    } = require('@opentelemetry/sdk-trace-base');

    this.tracerOpts = {
      resource: this.resource
    };
    if (config.sampleRate) {
      this.tracerOpts.sampler = new ParentBasedSampler({
        root: new TraceIdRatioBasedSampler(config.sampleRate)
      });
    }

    this.tracerProvider = new BasicTracerProvider(this.tracerOpts);

    debug('Configuring Exporter');
    this.traceExporterOpts = {};
    if (config.endpoint) {
      this.traceExporterOpts.url = config.endpoint;
    }

    if (config.headers) {
      this.traceExporterOpts.headers = config.headers;
    }

    const protocol = !config.protocol
      ? 'http'
      : this.protocols[config.protocol];

    const {
      OTLPTraceExporter
    } = require(`@opentelemetry/exporter-trace-otlp-${protocol}`);
    this.exporter = new OTLPTraceExporter(this.traceExporterOpts);

    this.tracerProvider.addSpanProcessor(
      new BatchSpanProcessor(this.exporter, {
        scheduledDelayMillis: 1000
      })
    );
    this.tracerProvider.register();
  }

  startOTelSpan(req, userContext, events, done) {
    debug('Starting span');
    const startTime = Date.now();
    userContext.vars['__otlStartTime'] = startTime;
    const span = trace
      .getTracer('artillery-tracer')
      .startSpan('http_request', { startTime });
    span.setAttribute('kind', 'client');
    span.addEvent('http_request_started', startTime);
    userContext.vars['__otlpSpan'] = span;

    return done();
  }

  exportOTelSpan(req, res, userContext, events, done) {
    if (!userContext.vars['__otlpSpan']) {
      return done();
    }

    const span = userContext.vars['__otlpSpan'];
    let endTime;

    if (res.timings && res.timings.phases) {
      span.setAttribute('responseTimeMs', res.timings.phases.firstByte);
      endTime =
        userContext.vars['__otlStartTime'] + res.timings.phases.firstByte;
      span.addEvent('http_request_ended', endTime);
    } else {
      span.addEvent('http_request_ended');
    }

    const url = new URL(req.url);
    span.setAttributes({
      url: url.href,
      'url.host': url.host,
      'http.request.method': req.method,
      'http.response.status_code': res.statusCode
    });

    if (this.tracesConfig?.attributes) {
      span.setAttributes(this.tracesConfig.attributes);
    }

    span.end(endTime || Date.now);

    debug('Span finished');
    return done();
  }

  async shutDown() {
    debug('Initiating TracerProvider shutdown');
    try {
      await this.tracerProvider.shutdown();
    } catch (err) {
      debug(err);
    }
    debug('TracerProvider shutdown completed');
    return true;
  }

  cleanup(done) {
    debug('Cleaning up');
    return this.shutDown().then(done);
  }
}

function createOTelReporter(config, events, script) {
  return new OTelReporter(config, events, script);
}

module.exports = {
  createOTelReporter
};
