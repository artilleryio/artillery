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

const {
  AsyncHooksContextManager
} = require('@opentelemetry/context-async-hooks');
const contextManager = new AsyncHooksContextManager();
contextManager.enable();
context.setGlobalContextManager(contextManager);

const { Resource } = require('@opentelemetry/resources');
const {
  SemanticResourceAttributes
} = require('@opentelemetry/semantic-conventions');

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
      // Set basics needed regardless of the engine
      this.traceConfig = config.traces;
      this.validateExporter(
        this.traceExporters,
        this.traceConfig.exporter,
        'trace'
      );
      this.tracing = true;
      this.configureTrace(this.traceConfig);
      // Create set of all engines used in test -> even though we only support Playwright and HTTP engine for now this is future compatible, same amount of work
      this.engines = new Set();
      const scenarios = this.script.scenarios || [];
      scenarios.forEach((scenario) => {
        scenario.engine
          ? this.engines.add(scenario.engine)
          : this.engines.add('http');
      });

      // Set hooks for tracing HTTP engine based scenarios
      if (this.engines.has('http')) {
        attachScenarioHooks(script, [
          {
            type: 'beforeRequest',
            name: 'startOTelSpan',
            hook: this.startOTelSpan.bind(this)
          },
          {
            type: 'afterResponse',
            name: 'exportOTelSpan',
            hook: this.exportOTelSpan.bind(this)
          }
        ]);
      }

      // Set hooks for tracing Playwright engine based scenarios
      if (this.engines.has('playwright')) {
        attachScenarioHooks(script, [
          {
            engine: 'playwright',
            type: 'traceFlowFunction',
            name: 'tracePerformanceFlow',
            hook: this.tracePerformanceFlow.bind(this)
          }
        ]);
      }
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

  tracePerformanceFlow(performanceEntries, specName, userFlowFunc) {
    // Set all timing events we are interested in and map their start and end to their respective property names in the performanceEntry object
    // We can then use this map to set spans for each of these events if their start and end times are present
    const timingEventsMap = {
      redirect: { start: 'redirectStart', end: 'redirectEnd' },
      fetch: { start: 'fetchStart', end: 'responseEnd' },
      dns_lookup: { start: 'domainLookupStart', end: 'domainLookupEnd' },
      tcp_handshake: { start: 'connectStart', end: 'connectEnd' },
      tls_negotiation: { start: 'secureConnectionStart', end: 'requestStart' },
      request: { start: 'requestStart', end: 'responseStart' },
      response: { start: 'responseStart', end: 'responseEnd' },
      dom_content_loaded: {
        start: 'domContentLoadedEventStart',
        end: 'domContentLoadedEventEnd'
      },
      load: { start: 'loadEventStart', end: 'loadEventEnd' }
    };
    // Set tracer for playwright
    this.playwrightTracer = trace.getTracer('artillery-playwright');
    debug('Tracer set');

    // Set parent span startTime as first available timestamp
    const firstAction = performanceEntries[0];
    const parentStartTime =
      firstAction.startTime ||
      firstAction.redirectStart ||
      firstAction.fetchStart ||
      firstAction.requestStart;

    // Start Parent Span
    this.playwrightTracer.startActiveSpan(
      specName || 'Scenario execution',
      { kind: SpanKind.CLIENT, startTime: parentStartTime },
      (parent) => {
        performanceEntries.forEach((entry) => {
          if (
            entry.entryType != 'resource' &&
            entry.entryType != 'navigation'
          ) {
            return;
          }
          // Start entry span
          const startTime =
            entry.startTime ||
            entry.redirectStart ||
            entry.fetchStart ||
            entry.requestStart;

          this.playwrightTracer.startActiveSpan(
            entry.name,
            {
              startTime: startTime,
              kind: SpanKind.CLIENT
            },
            (span) => {
              const url = new URL(entry.name);
              span.setAttributes({
                'url.full': url.href,
                'server.address': url.hostname,
                // We set the port if it is specified, if not we set to a default port based on the protocol
                'server.port': url.port || (url.protocol === 'http' ? 80 : 443),
                'url.path': url.pathname,
                'url.query': url.search,
                'http.response.status_code': entry.responseStatus,
                'next.hop.protocol': entry.nextHopProtocol,
                'render.blocking.status': entry.renderBlockingStatus,
                duration: entry.duration,
                'redirect.count': entry.redirectCount,
                'initiator.type': entry.initiatorType,
                'content.compressed': entry.decodedBodySize != entry.encodedBodySize
              });
              if(entry.type){
                span.setAttribute('type', entry.type)
              }
              if (entry.domInteractive) {
                span.addEvent('dom_interactive', entry.domInteractive);
              }
              if (entry.domComplete) {
                span.addEvent('dom_complete', entry.domComplete);
              }

              // This is where we create the spans for the timing events that we have the data for
              for (const [name, value] of Object.entries(timingEventsMap)) {
                if (entry[value.start] && entry[value.end]) {
                  this.playwrightTracer
                    .startSpan(name, {
                      kind: SpanKind.CLIENT,
                      startTime: entry[value.start]
                    })
                    .end(entry[value.end]);
                }
              }

              // Set span status as error for respons status codes that are over 400
              if (entry.responseStatus >= 400) {
                span.setStatus({ code: SpanStatusCode.ERROR });
              }
              // End the entry span
              span.end(
                entry.loadEventEnd ||
                  entry.domComplete ||
                  entry.responseEnd ||
                  Date.now()
              );
            }
          );
        });
        // End the parent span
        const lastAction = performanceEntries[performanceEntries.length - 1];
        parent.end(
          lastAction.loadEventEnd || lastAction.responseEnd || Date.now()
        );
      }
    );
  }

  async shutDown() {
    if (this.metrics) {
      while (this.pendingRequests > 0) {
        debug('Waiting for pending request ...');
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      debug('Pending requests done');
      debug('Shutting the Reader down');
      await this.theReader.shutdown(); //check if shutdown successfull
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
