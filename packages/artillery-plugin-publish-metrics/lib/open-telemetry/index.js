'use strict';

const debug = require('debug')('plugin:publish-metrics:open-telemetry');
const { attachScenarioHooks } = require('../util');
const grpc = require('@grpc/grpc-js');

const {
  diag,
  DiagConsoleLogger,
  DiagLogLevel,
  SpanKind,
  SpanStatusCode,
  trace,
  context,
  metrics
} = require('@opentelemetry/api');
const { Resource } = require('@opentelemetry/resources');
const {
  SemanticResourceAttributes
} = require('@opentelemetry/semantic-conventions');

const {
  AsyncHooksContextManager
} = require('@opentelemetry/context-async-hooks');
const contextManager = new AsyncHooksContextManager();
contextManager.enable();
context.setGlobalContextManager(contextManager);

class OTelReporter {
  constructor(config, events, script) {
    this.script = script;
    this.events = events;
    if (
      process.env.DEBUG &&
      process.env.DEBUG === 'plugin:publish-metrics:open-telemetry'
    ) {
      diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
    }
    this.metricExporters = {
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

    this.resource = Resource.default().merge(
      new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]:
          config.serviceName || 'Artillery-test'
      })
    );

    // Metrics
    if (config.metrics) {
      this.validateExporter(
        this.metricExporters,
        config.metrics.exporter,
        'metric'
      );
      this.metrics = true;
      this.configureMetrics(config.metrics);

      this.pendingRequests = 0;

      this.events.on('stats', async (stats) => {
        this.pendingRequests += 1;

        // Set the start and end times
        let startTime = stats.firstMetricAt;
        let endTime = stats.lastMetricAt;
        this.metricsConfig.attributes.startTime = startTime;
        this.metricsConfig.attributes.endTime = endTime;

        // Record metrics
        this.recordCounters(stats.counters, this.metricsConfig);
        this.recordRates(stats.rates, this.metricsConfig);
        this.recordSummaries(stats.summaries, this.metricsConfig);

        // Collect and export metrics (we call the _runOnce manually since we disabled the internal timer inside configureMetrics)
        await this.theReader._runOnce();

        this.pendingRequests -= 1;
      });
    }

    if (config.traces) {
      this.traceConfig = config.traces;
      this.validateExporter(
        this.traceExporters,
        this.traceConfig.exporter,
        'trace'
      );
      this.tracing = true;

      this.configureTrace(this.traceConfig);

      attachScenarioHooks(script, [
        {
          type: 'beforeRequest',
          name: 'startOTelSpan',
          hook: this.startHTTPRequestSpan.bind(this)
        },
        {
          type: 'afterResponse',
          name: 'exportOTelSpan',
          hook: this.endHTTPRequestSpan.bind(this)
        },
        {
          type: 'beforeScenario',
          name: 'startScenarioSpan',
          hook: this.startScenarioSpan('http').bind(this)
        },
        {
          type: 'afterScenario',
          name: 'endScenarioSpan',
          hook: this.endScenarioSpan('http').bind(this)
        }
      ]);
    }
  }

  configureMetrics(config) {
    this.metricsConfig = {
      exporter: config.exporter || 'otlp-http',
      meterName: config.meterName || 'Artillery.io_metrics',
      includeOnly: config.includeOnly || [],
      exclude: config.exclude || [],
      attributes: config.attributes || {}
    };

    const {
      AggregationTemporality,
      MeterProvider,
      PeriodicExportingMetricReader
    } = require('@opentelemetry/sdk-metrics');

    this.meterProvider = new MeterProvider({
      resource: this.resource
    });

    debug('Configuring Metric Exporter');

    // Setting configuration options for exporter
    this.metricsExporterOpts = {
      temporalityPreference: AggregationTemporality.DELTA
    };
    if (config.endpoint) {
      this.metricsExporterOpts.url = config.endpoint;
    }

    if (config.headers) {
      if (config.exporter === 'otlp-grpc') {
        const metadata = new grpc.Metadata();
        Object.entries(config.headers).forEach(([k, v]) => metadata.set(k, v));
        this.metricsExporterOpts.metadata = metadata;
      } else {
        this.metricsExporterOpts.headers = config.headers;
      }
    }

    this.metricsExporter = this.metricExporters[
      this.metricsConfig.exporter || 'otlp-http'
    ](this.metricsExporterOpts);

    this.theReader = new PeriodicExportingMetricReader({
      exporter: this.metricsExporter
    });

    // Clear the reader's interval so it only collects and exports when we manually call it (otherwise we get duplicated reports causing incorrect aggregated data results)
    clearInterval(this.theReader._interval);

    this.meterProvider.addMetricReader(this.theReader);
    metrics.setGlobalMeterProvider(this.meterProvider);

    this.meter = this.meterProvider.getMeter(this.metricsConfig.meterName);
    this.counters = {};
    this.gauges = {};
  }

  shouldSendMetric(metricName, excluded, includeOnly) {
    if (excluded.includes(metricName)) {
      return;
    }
    if (includeOnly.length > 0 && !includeOnly.includes(metricName)) {
      return;
    }
    return true;
  }

  recordCounters(counters, config) {
    for (const [name, value] of Object.entries(counters || {})) {
      if (!this.shouldSendMetric(name, config.exclude, config.includeOnly)) {
        continue;
      }

      if (!this.counters[name]) {
        this.counters[name] = this.meter.createCounter(name);
      }
      this.counters[name].add(value, config.attributes);
    }
  }

  recordRates(rates, config) {
    for (const [name, value] of Object.entries(rates || {})) {
      if (!this.shouldSendMetric(name, config.exclude, config.includeOnly)) {
        continue;
      }
      if (!this.gauges[name]) {
        this.meter
          .createObservableGauge(name)
          .addCallback((observableResult) => {
            observableResult.observe(this.gauges[name], config.attributes);
          });
      }
      this.gauges[name] = value;
    }
  }

  recordSummaries(summaries, config) {
    for (const [name, values] of Object.entries(summaries || {})) {
      if (!this.shouldSendMetric(name, config.exclude, config.includeOnly)) {
        continue;
      }

      for (const [aggregation, value] of Object.entries(values)) {
        const metricName = `${name}.${aggregation}`;
        if (!this.gauges[metricName]) {
          this.meter
            .createObservableGauge(metricName)
            .addCallback((observableResult) => {
              observableResult.observe(
                this.gauges[metricName],
                config.attributes
              );
            });
        }
        this.gauges[metricName] = value;
      }
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
      if (config.exporter && config.exporter === 'otlp-grpc') {
        const metadata = new grpc.Metadata();
        Object.entries(config.headers).forEach(([k, v]) => metadata.set(k, v));
        this.traceExporterOpts.metadata = metadata;
      } else {
        this.traceExporterOpts.headers = config.headers;
      }
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

  // Sets the tracer by engine type, starts the scenario span and adds it to the VU context
  startScenarioSpan(engine) {
    return function (userContext, ee, next) {
      // get and set the tracer by engine
      const tracerName = engine + 'Tracer';
      this[tracerName] = trace.getTracer(`artillery-${engine}`);
      const span = this[tracerName].startSpan(
        userContext.scenario?.name || `artillery-${engine}-scenario`,
        {
          startTime: Date.now(),
          kind: SpanKind.CLIENT
        }
      );

      debug('Scenario span created');
      userContext.vars[`__${engine}ScenarioSpan`] = span;
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
      span.end(Date.now());
      if (engine === 'http') {
        next();
      } else {
        return;
      }
    };
  }

  startHTTPRequestSpan(req, userContext, events, done) {
    const startTime = Date.now();
    const scenarioSpan = userContext.vars['__httpScenarioSpan'];
    context.with(trace.setSpan(context.active(), scenarioSpan), () => {
      const spanName =
        this.traceConfig.useRequestNames && req.name
          ? req.name
          : req.method.toLowerCase();
      const span = this.httpTracer.startSpan(spanName, {
        startTime,
        kind: SpanKind.CLIENT,
        attributes: { 'vu.uuid': userContext.$uuid }
      });
      userContext.vars['__otlpHTTPRequestSpan'] = span;

      events.on('error', (err) => {
        span.recordException(err);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: err.message || err
        });
        debug('Span status set as error due to the following error: \n', err);
        span.end(Date.now);
      });
    });
    return done();
  }

  endHTTPRequestSpan(req, res, userContext, events, done) {
    if (!userContext.vars['__otlpHTTPRequestSpan']) {
      return done();
    }

    const span = userContext.vars['__otlpHTTPRequestSpan'];
    let endTime;

    if (res.timings && res.timings.phases) {
      span.setAttribute('response.time.ms', res.timings.phases.firstByte);

      // Child spans are created for each phase of the request from the timings object and named accordingly. More info here: https://github.com/sindresorhus/got/blob/main/source/core/response.ts
      // Map names of request phases to the timings parameters representing their start and end times for easier span creation
      const timingsMap = {
        dns_lookup: { start: 'socket', end: 'lookup' },
        tcp_handshake: { start: 'lookup', end: 'connect' },
        tls_negotiation: { start: 'connect', end: 'secureConnect' },
        request: {
          start: res.timings.secureConnect ? 'secureConnect' : 'connect',
          end: 'upload'
        },
        download: { start: 'response', end: 'end' },
        first_byte: { start: 'upload', end: 'response' }
      };

      // Create phase spans within the request span context
      context.with(trace.setSpan(context.active(), span), () => {
        for (const [name, value] of Object.entries(timingsMap)) {
          if (res.timings[value.start] && res.timings[value.end]) {
            this.httpTracer
              .startSpan(name, {
                kind: SpanKind.CLIENT,
                startTime: res.timings[value.start]
              })
              .end(res.timings[value.end]);
          }
        }
      });
      endTime = res.timings.end || res.timings.error || res.timings.abort;
    }

    try {
      const url = new URL(req.url);
      span.setAttributes({
        'url.full': url.href,
        'url.path': url.pathname,
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
      span.end(endTime || Date.now());
    } catch (err) {
      // We don't do anything, if error occurs at this point it will be due to us already ending the span in beforeRequest hook in case of an error.
    }
    return done();
  }

  validateExporter(supportedExporters, exporter, type) {
    const supported = Object.keys(supportedExporters).reduce(
      (acc, k, i) =>
        acc +
        k +
        (i === Object.keys(supportedExporters).length - 1 ? '.' : ', '),
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

  async shutDown() {
    if (this.metrics) {
      while (this.pendingRequests > 0) {
        debug('Waiting for pending request ...');
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      debug('Pending requests done');
      debug('Shutting the Reader down');
      await this.theReader.shutdown();
      debug('Shut down sucessfull');
    }
    if (this.tracing) {
      debug('Initiating TracerProvider shutdown');
      try {
        await this.tracerProvider.shutdown();
      } catch (err) {
        debug(err);
      }
      debug('TracerProvider shutdown completed');
    }
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
