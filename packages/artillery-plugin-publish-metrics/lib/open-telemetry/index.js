'use strict';

const debug = require('debug')('plugin:publish-metrics:open-telemetry');
const { attachScenarioHooks } = require('../util');

const { SpanKind, SpanStatusCode, trace } = require('@opentelemetry/api');
const { Resource } = require('@opentelemetry/resources');
const {
  SemanticResourceAttributes
} = require('@opentelemetry/semantic-conventions');

class OTelReporter {
  constructor(config, events, script) {
    this.script = script;
    this.events = events;
    this.traceExporters = {
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
      zipkin(options) {
        const { ZipkinExporter } = require('@opentelemetry/exporter-zipkin');
        return new ZipkinExporter(options);
      }
    };

    this.resource = Resource.default().merge(
      new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]:
          config.serviceName || 'Artillery-test'
      })
    );

    if (config.traces) {
      this.traceConfig = config.traces;
      const supported = Object.keys(this.traceExporters).reduce(
        (acc, k, i) =>
          acc +
          k +
          (i === Object.keys(this.traceExporters).length - 1 ? '.' : ', '),
        ''
      );

      if (
        this.traceConfig.exporter &&
        !this.traceExporters[this.traceConfig.exporter]
      ) {
        throw new Error(
          `Open-telemetry reporter: Exporter ${this.traceConfig.exporter} is not supported. Currently supported exporters are ${supported}`
        );
      }
      this.tracing = true;

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

    this.exporter = this.traceExporters[config.exporter || 'otlp-http'](
      this.traceExporterOpts
    );

    this.tracerProvider.addSpanProcessor(
      new BatchSpanProcessor(this.exporter, {
        scheduledDelayMillis: 1000
      })
    );
    this.tracerProvider.register();
  }

  startOTelSpan(req, userContext, events, done) {
    const startTime = Date.now();
    userContext.vars['__otlStartTime'] = startTime;
    const spanName =
      this.traceConfig.useRequestNames && req.name
        ? req.name
        : req.method.toLowerCase();
    const span = trace.getTracer('artillery-tracer').startSpan(spanName, {
      startTime,
      kind: SpanKind.CLIENT
    });

    span.addEvent('http_request_started', startTime);
    userContext.vars['__otlpSpan'] = span;

    events.on('error', (err) => {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err.message || err
      });
      debug('Span status set as error due to the following error: \n', err);
      span.end(Date.now);
    });

    return done();
  }

  exportOTelSpan(req, res, userContext, events, done) {
    if (!userContext.vars['__otlpSpan']) {
      return done();
    }
    // TODO check status code. if status code is 1xx, 2xx or 3xx do nothing, unless there was an error, then set span status to error. if s code is in 4xx set status as error
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
      'url.full': url.href,
      'server.address': url.hostname,
      // We set the port if it is specified, if not we set to a default port based on the protocol
      'server.port': url.port || (url.protocol === 'http' ? 80 : 443),
      'http.request.method': req.method,
      'http.response.status_code': res.statusCode
    });

    if (res.statusCode >= 400) {
      span.setStatus({ code: SpanStatusCode.ERROR });
    }
    if (this.traceConfig?.attributes) {
      span.setAttributes(this.traceConfig.attributes);
    }

    span.end(endTime || Date.now);

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
