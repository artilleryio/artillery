'use strict';

const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { diag } = require('@opentelemetry/api');

class OutlierDetectionBatchSpanProcessor extends BatchSpanProcessor {
  constructor(exporter, config) {
    super(exporter, config);
    this._traces = new Map();
  }

  onEnd(span) {
    if (span.instrumentationLibrary.name === 'artillery-playwright') {
      super.onEnd(span);
    } else {
      const traceId = span.spanContext().traceId;

      // When an outlier span is recognised the whole trace it belongs to is exported, so all the spans that belong to the trace need to be grouped and held until the trace finishes.
      if (!this._traces.has(traceId)) {
        this._traces.set(traceId, {
          spans: [],
          hasOutlier: false
        });
      }
      const traceData = this._traces.get(traceId);
      traceData.spans.push(span);

      // Since only request level spans are screened for outliers, the outlier check is performed only if the span is a request level span - has 'http.url' attribute
      if (span.attributes['http.url'] && this._isOutlier(span)) {
        traceData.hasOutlier = true;
      }

      // The trace ends when the root span ends, so we only filter and send data when the span that ended is the root span
      // The traces that do not have outlier spans are dropped and the rest is sent to buffer/export
      if (!span.parentSpanId) {
        if (traceData.hasOutlier) {
          traceData.spans.forEach(super.onEnd, this);
        }
        this._traces.delete(traceId);
      }
    }
  }
  // Export only outliers on shut down as well for http engine
  onShutdown() {
    this._traces.forEach((traceData, traceId) => {
      if (traceData.hasOutlier) {
        traceData.spans.forEach(super.onEnd, this);
      }
    });
    this._traces.clear();
    // By here all the available HTTP engine traces are processed and sent to buffer, the parent onShutDown will cover for possible playwright engine traces and the shutdown process
    super.onShutdown();
  }

  // The outlier detection logic based on the provided criteria
  _isOutlier(span) {
    return !!span.attributes.outlier;
  }
}

module.exports = { OutlierDetectionBatchSpanProcessor };
