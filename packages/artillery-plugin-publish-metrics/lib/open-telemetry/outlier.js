'use strict';

const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { diag } = require('@opentelemetry/api');

class OutlierDetectionBatchSpanProcessor extends BatchSpanProcessor {
  constructor(exporter, config, outlierOpts) {
    super(exporter, config);
    this.outlierCriteria = Object.assign(
      {
        responseTime: 500,
        requestDuration: 2000,
        statusAsErr: true,
        status4xxAsErr: true
      },
      outlierOpts || {}
    );
    this._traces = new Map();
  }

  onEnd(span) {
    const traceId = span.spanContext().traceId;
    if (!this._traces.has(traceId)) {
      this._traces.set(traceId, {
        spans: [],
        hasOutlier: false
      });
    }

    const traceData = this._traces.get(traceId);
    traceData.spans.push(span);
    if (this._isOutlier(span)) {
      traceData.hasOutlier = true;
    }

    // Processing (sending to buffer,exporting) the spans when the scenarioSpan ends
    if (!span.parentSpanId) {
      if (traceData.hasOutlier) {
        traceData.spans.forEach(super.onEnd, this);
      }
      this._traces.delete(traceId);
    }
  }

  // Exporting only outliers on shutdown as well
  onShutdown() {
    this._traces.forEach((traceData, traceId) => {
      if (traceData.hasOutlier) {
        traceData.spans.forEach(super.onEnd, this);
      }
    });
    this._traces.clear();
  }

  // The outlier detection logic based on the provided criteria
  _isOutlier(span) {
    // const statusOutlier = this.outlierCriteria.status4xxAsErr ? span.attributes['http.response.status_code'] >= 400 : this.outlierCriteria.statusAsErr ? span.attributes['http.response.status_code'] >= 500 : false
    return (
      span.status.code == 2 ||
      span.attributes['response.time.ms'] >=
        this.outlierCriteria.responseTime ||
      span.attributes['http.request.duration'] >=
        this.outlierCriteria.requestDuration
    );
  }
}

module.exports = { OutlierDetectionBatchSpanProcessor };
