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
  SemanticResourceAttributes,
  SemanticAttributes
} = require('@opentelemetry/semantic-conventions');

const {
  AsyncLocalStorageContextManager
} = require('@opentelemetry/context-async-hooks');
const contextManager = new AsyncLocalStorageContextManager();
contextManager.enable();
context.setGlobalContextManager(contextManager);

class OTelReporter {
  constructor(config, events, script) {
    this.config = config;
    this.script = script;
    this.events = events;

    // DEBUGGING SETUP
    if (
      process.env.DEBUG &&
      process.env.DEBUG === 'plugin:publish-metrics:open-telemetry'
    ) {
      diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);
    }

    // RESOURCES SETUP
    this.resource = Resource.default().merge(
      new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]:
          config.serviceName || 'Artillery-test'
      })
    );

    // HANDLING METRICS
    if (config.metrics) {
      // Get the metric exporters
      this.metricExporters = require('./exporters').metricExporters;

      // Validate exporter provided by user
      this.validateExporter(
        this.metricExporters,
        config.metrics.exporter,
        'metric'
      );

      // Configure and run metrics
      const { OTelMetricsReporter } = require('./metrics');
      this.metricReporter = new OTelMetricsReporter(
        config.metrics,
        this.events,
        this.resource,
        metrics
      );
    }

    // HANDLING TRACES
    if (config.traces) {
      // Get the trace exporters
      this.traceExporters = require('./exporters').traceExporters;

      // Validate exporter provided by user
      this.validateExporter(
        this.traceExporters,
        this.config.traces.exporter,
        'trace'
      );
      this.tracing = true;

      const { OTelTraceConfig } = require('./trace-base');
      this.traceConfig = new OTelTraceConfig(config.traces, this.resource);
      this.traceConfig.configure();

      // Create set of all engines used in test -> even though we only support Playwright and HTTP engine for now this is future compatible
      this.engines = new Set();
      const scenarios = this.script.scenarios || [];
      scenarios.forEach((scenario) => {
        scenario.engine
          ? this.engines.add(scenario.engine)
          : this.engines.add('http');
      });

      if (this.engines.has('http')) {
        this.pendingRequestSpans = 0;
        this.pendingScenarioSpans = 0;

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
          },
          {
            type: 'onError',
            name: 'otelTraceOnError',
            hook: this.otelTraceOnError.bind(this)
          }
        ]);
      }

      if (this.engines.has('playwright')) {
        // Create tracer for Playwright engine
        this.playwrightTracer = trace.getTracer('artillery-playwright');

        attachScenarioHooks(script, [
          {
            engine: 'playwright',
            type: 'traceFlowFunction',
            name: 'runOtelTracingForPlaywright',
            hook: this.runOtelTracingForPlaywright.bind(this)
          }
        ]);
      }
    }
  }

  // Sets the tracer by engine type, starts the scenario span and adds it to the VU context
  startScenarioSpan(engine) {
    return function (userContext, ee, next) {
      // get and set the tracer by engine
      const tracerName = engine + 'Tracer';
      if (!this[tracerName]) {
        this[tracerName] = trace.getTracer(`artillery-${engine}`);
      }
      const span = this[tracerName].startSpan(
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

  startHTTPRequestSpan(req, userContext, events, done) {
    const startTime = Date.now();
    const scenarioSpan = userContext.vars['__httpScenarioSpan'];
    context.with(trace.setSpan(context.active(), scenarioSpan), () => {
      const spanName =
        this.traceConfig.useRequestNames && req.name
          ? req.name
          : req.method.toLowerCase();

      const url = new URL(req.url);
      let parsedUrl;
      if (url.username || url.password) {
        parsedUrl = url.origin + url.pathname + url.search + url.hash;
      }
      const span = this.httpTracer.startSpan(spanName, {
        startTime,
        kind: SpanKind.CLIENT,
        attributes: {
          'vu.uuid': userContext.vars.$uuid,
          [SemanticAttributes.HTTP_URL]: parsedUrl || url.href,
          // We set the port if it is specified, if not we set to a default port based on the protocol
          [SemanticAttributes.HTTP_SCHEME]:
            url.port || (url.protocol === 'http' ? 80 : 443),
          [SemanticAttributes.HTTP_METHOD]: req.method,
          [SemanticAttributes.NET_HOST_NAME]: url.hostname,
          ...(this.traceConfig.attributes || {})
        }
      });

      userContext.vars['__otlpHTTPRequestSpan'] = span;
      this.pendingRequestSpans++;
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
                startTime: res.timings[value.start],
                attributes: { 'vu.uuid': userContext.vars.$uuid }
              })
              .end(res.timings[value.end]);
          }
        }
      });
      endTime = res.timings.end || res.timings.error || res.timings.abort;
    }

    try {
      span.setAttributes({
        [SemanticAttributes.HTTP_STATUS_CODE]: res.statusCode,
        [SemanticAttributes.HTTP_REQUEST_CONTENT_LENGTH]:
          res.request.options.headers['content-length'],
        [SemanticAttributes.HTTP_FLAVOR]: res.httpVersion,
        [SemanticAttributes.HTTP_USER_AGENT]:
          res.request.options.headers['user-agent']
      });

      if (res.statusCode >= 400) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: res.statusMessage
        });
      }
      if (!span.endTime[0]) {
        span.end(endTime || Date.now());
        this.pendingRequestSpans--;
      }
    } catch (err) {
      debug(err);
    }
    return done();
  }

  otelTraceOnError(err, req, userContext, ee, done) {
    const scenarioSpan = userContext.vars.__httpScenarioSpan;
    const requestSpan = userContext.vars.__otlpHTTPRequestSpan;
    // If the error happened outside the request, the request span will be handled in the afterResponse hook
    // If the error happens on the request we set the exception on the request, otherwise we set it to the scenario span
    if (!requestSpan.endTime[0]) {
      requestSpan.recordException(err);
      requestSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: err.message || err
      });
      requestSpan.end();
      this.pendingRequestSpans--;
    } else {
      scenarioSpan.recordException(err);
    }
    // We set the scenario span status to error regardles of what level the error happened in (scenario or request) for easier querrying
    scenarioSpan.setStatus({
      code: SpanStatusCode.ERROR,
      message: err.message || err
    });
    scenarioSpan.end();
    this.pendingScenarioSpans--;
    return done();
  }

  async runOtelTracingForPlaywright(
    page,
    vuContext,
    events,
    userFlowFunction,
    specName
  ) {
    // Start scenarioSpan as a root span for the trace and set it as active context
    return await this.playwrightTracer.startActiveSpan(
      specName || 'Scenario execution',
      { kind: SpanKind.CLIENT },
      async (scenarioSpan) => {
        scenarioSpan.setAttributes({
          'vu.uuid': vuContext.vars.$uuid,
          ...(this.traceConfig.attributes || {})
        });

        // Set variables to track state and context
        const ctx = context.active();
        let lastPageUrl;
        let pageUrl;
        let pageSpan;

        // Listen to histograms to capture web vitals and other metrics set by Playwright engine, set them as attributes and if they are web vitals, as events too
        events.on('histogram', (name, value, metadata) => {
          // vuId from event must match current vuId
          if (!metadata || metadata.vuId !== vuContext.vars.$uuid) {
            return;
          }

          // Only look for page metrics or memory_used_mb metric. step metrics are handled separately in the step helper itself
          if (
            !name.startsWith('browser.page') &&
            name !== 'browser.memory_used_mb'
          ) {
            return;
          }

          // Associate only the metrics that belong to the page
          if (metadata.url !== pageSpan.name.replace('Page: ', '')) {
            return;
          }
          const webVitals = ['LCP', 'FCP', 'CLS', 'TTFB', 'INP', 'FID'];

          try {
            const attrs = {};
            const metricName =
              name === 'browser.memory_used_mb' ? name : name.split('.')[2];

            if (webVitals.includes(metricName)) {
              attrs[`web_vitals.${metricName}.value`] = value;
              attrs[`web_vitals.${metricName}.rating`] = metadata.rating;
              pageSpan.addEvent(metricName, attrs);
            } else {
              attrs[metricName] = value;
            }
            pageSpan.setAttributes(attrs);
          } catch (err) {
            throw new Error(err);
          }
        });

        // Upon navigation to main frame, if the URL is different than existing page span, the existing page span is closed and new opened with new URL
        page.on('framenavigated', (frame) => {
          //only interested in mainframe navigations (not iframes, etc)
          if (frame !== page.mainFrame()) {
            return;
          }

          pageUrl = page.url();

          //only create a new span if the currently navigated page is different.
          //this is because we can have multiple framenavigated for the same url, but we're only interested in navigation changes
          if (pageUrl !== lastPageUrl) {
            scenarioSpan.addEvent(`navigated to ${page.url()}`);
            if (pageSpan) {
              pageSpan.end();
            }

            pageSpan = this.playwrightTracer.startSpan(
              'Page: ' + pageUrl,
              { kind: SpanKind.CLIENT },
              ctx
            );
            pageSpan.setAttributes({
              'vu.uuid': vuContext.vars.$uuid,
              ...(this.traceConfig.attributes || {})
            });
            lastPageUrl = pageUrl;
          }
        });

        try {
          // Set the tracing 'this.step' function to the 'test' object which is exposed to the user
          const test = {
            step: (
              await this.step(
                scenarioSpan,
                this.playwrightTracer,
                events,
                vuContext
              )
            ).bind(this)
          };
          // Execute the user-provided processor function within the context of the new span
          await userFlowFunction(page, vuContext, events, test);
        } catch (err) {
          scenarioSpan.recordException(err, Date.now());
          scenarioSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: err.message
          });
          throw err;
        } finally {
          if (pageSpan && !pageSpan.endTime[0]) {
            pageSpan.end();
          }
          scenarioSpan.end();
        }
      }
    );
  }

  async step(parent, tracer, events, vuContext) {
    return async function (stepName, callback) {
      // Set the parent context to be scenarioSpan and within it we create step spans
      return contextManager.with(
        trace.setSpan(context.active(), parent),
        async () => {
          const span = tracer.startSpan(
            stepName,
            { kind: SpanKind.CLIENT },
            context.active()
          );
          const startTime = Date.now();

          try {
            span.setAttributes({
              'vu.uuid': vuContext.vars.$uuid,
              ...(this.traceConfig.attributes || {})
            });

            await callback();
          } catch (err) {
            debug('There has been an error during step execution: ', err);
            span.recordException(err, Date.now());
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: err.message
            });
          } finally {
            const difference = Date.now() - startTime;
            events.emit('histogram', `browser.step.${stepName}`, difference);
            span.end();
          }
        }
      );
    };
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
    if (this.metricReporter) {
      await this.metricReporter.cleanup();
    }

    if (this.tracing) {
      while (this.pendingRequestSpans > 0 || this.pendingScenarioSpans > 0) {
        debug('Waiting for pending traces ...');
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      debug('Pending traces done');
      await this.traceConfig.shutDown();
    }
  }

  async cleanup(done) {
    debug('Cleaning up');
    return await this.shutDown().then(done);
  }
}

function createOTelReporter(config, events, script) {
  return new OTelReporter(config, events, script);
}

module.exports = {
  createOTelReporter
};
