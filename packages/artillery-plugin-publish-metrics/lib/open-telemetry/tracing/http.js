'use strict';

const { attachScenarioHooks } = require('../../util');
const { OTelTraceBase } = require('./base');

const { SemanticAttributes } = require('@opentelemetry/semantic-conventions');
const {
  SpanKind,
  SpanStatusCode,
  trace,
  context
} = require('@opentelemetry/api');

class OTelHTTPTraceReporter extends OTelTraceBase {
  constructor(config, script) {
    super(config, script);
    this.outlierCriteria = config.smartSampling;
    this.statusAsErrorThreshold = 400;
  }
  run() {
    this.setTracer('http');
    attachScenarioHooks(this.script, [
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

  startHTTPRequestSpan(req, userContext, events, done) {
    const startTime = Date.now();
    const scenarioSpan = userContext.vars['__httpScenarioSpan'];
    if (!scenarioSpan) {
      return done();
    }
    context.with(trace.setSpan(context.active(), scenarioSpan), () => {
      let spanName =
        this.config.useRequestNames && req.name
          ? req.name
          : req.method.toLowerCase();
      if (this.config.replaceSpanNameRegex) {
        spanName = this.replaceSpanNameRegex(
          spanName,
          this.config.replaceSpanNameRegex
        );
      }

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
          test_id: userContext.vars.$testId,
          [SemanticAttributes.HTTP_URL]: parsedUrl || url.href,
          // We set the port if it is specified, if not we set to a default port based on the protocol
          [SemanticAttributes.HTTP_SCHEME]:
            url.port || (url.protocol === 'http' ? 80 : 443),
          [SemanticAttributes.HTTP_METHOD]: req.method,
          [SemanticAttributes.NET_HOST_NAME]: url.hostname,
          ...(this.config.attributes || {})
        }
      });
      const spanMap = userContext.vars['__otlpHTTPRequestSpans'] || {};
      spanMap[req.uuid] = span;
      userContext.vars['__otlpHTTPRequestSpans'] = spanMap;
      this.pendingRequestSpans++;
    });
    return done();
  }

  endHTTPRequestSpan(req, res, userContext, events, done) {
    const span = userContext.vars['__otlpHTTPRequestSpans']?.[req.uuid];
    if (!span) {
      return done();
    }

    let endTime;

    const scenarioSpan = userContext.vars['__httpScenarioSpan'];
    if (this.config.smartSampling) {
      this.tagResponseOutliers(span, scenarioSpan, res, this.outlierCriteria);
    }

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
        for (let [name, value] of Object.entries(timingsMap)) {
          if (res.timings[value.start] && res.timings[value.end]) {
            if (this.config.replaceSpanNameRegex) {
              name = this.replaceSpanNameRegex(
                name,
                this.config.replaceSpanNameRegex
              );
            }
            this.httpTracer
              .startSpan(name, {
                kind: SpanKind.CLIENT,
                startTime: res.timings[value.start],
                attributes: {
                  'vu.uuid': userContext.vars.$uuid,
                  test_id: userContext.vars.$testId
                }
              })
              .end(res.timings[value.end]);
            events.emit('counter', 'plugins.publish-metrics.spans.exported', 1);
          }
        }
      });
      endTime = res.timings.end || res.timings.error || res.timings.abort;
    }

    try {
      span.setAttributes({
        [SemanticAttributes.HTTP_STATUS_CODE]: res.statusCode,
        [SemanticAttributes.HTTP_FLAVOR]: res.httpVersion,
        [SemanticAttributes.HTTP_USER_AGENT]: req.headers['user-agent']
      });
      if (res.headers['content-length']) {
        span.setAttribute(
          SemanticAttributes.HTTP_REQUEST_CONTENT_LENGTH,
          res.headers['content-length']
        );
      }
      if (res.statusCode >= this.statusAsErrorThreshold) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: res.statusMessage
        });
      }
    } catch (err) {
      this.debug(err);
    }

    try {
      if (!span.endTime[0]) {
        span.end(endTime || Date.now());
        this.pendingRequestSpans--;
        events.emit('counter', 'plugins.publish-metrics.spans.exported', 1);
      }
    } catch (err) {
      this.debug(err);
    }
    return done();
  }

  otelTraceOnError(err, req, userContext, events, done) {
    const scenarioSpan = userContext.vars.__httpScenarioSpan;
    const requestSpan = userContext.vars.__otlpHTTPRequestSpan;
    if (!scenarioSpan) {
      return done();
    }
    // If the error happened outside the request, the request span will be handled in the afterResponse hook
    // If the error happens on the request we set the exception on the request, otherwise we set it to the scenario span
    if (requestSpan && !requestSpan.endTime[0]) {
      requestSpan.recordException(err);
      requestSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: err.message || err
      });

      if (this.config.smartSampling) {
        requestSpan.setAttributes({
          outlier: 'true',
          'outlier.type.error': true
        });
      }

      requestSpan.end();
      this.pendingRequestSpans--;
      events.emit('counter', 'plugins.publish-metrics.spans.exported', 1);
    } else {
      scenarioSpan?.recordException(err);
    }
    // We set the scenario span status to error regardles of what level the error happened in (scenario or request) for easier querrying
    scenarioSpan.setStatus({
      code: SpanStatusCode.ERROR,
      message: err.message || err
    });

    if (this.config.smartSampling) {
      scenarioSpan.setAttributes({
        outlier: 'true',
        'outlier.type.error': true
      });
    }

    scenarioSpan.end();
    this.pendingScenarioSpans--;
    events.emit('counter', 'plugins.publish-metrics.spans.exported', 1);
    return done();
  }

  tagResponseOutliers(span, scenarioSpan, res, criteria) {
    const types = {};
    const details = [];
    if (res.statusCode >= this.statusAsErrorThreshold) {
      types['outlier.type.status_code'] = true;
      details.push(`HTTP Status Code >= ${this.statusAsErrorThreshold}`);
    }
    if (criteria.thresholds && res.timings?.phases) {
      Object.entries(criteria.thresholds).forEach(([name, value]) => {
        if (res.timings.phases[name] >= value) {
          types[`outlier.type.${name}`] = true;
          details.push(`'${name}' >= ${value}`);
        }
      });
    }

    if (!details.length) {
      return;
    }

    span.setAttributes({
      outlier: 'true',
      'outlier.details': details.join(', '),
      ...types
    });

    scenarioSpan.setAttributes({
      outlier: 'true',
      ...types
    });
  }
}

module.exports = {
  OTelHTTPTraceReporter
};
