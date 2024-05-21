'use strict';

const {
  AggregationTemporality,
  MeterProvider,
  PeriodicExportingMetricReader
} = require('@opentelemetry/sdk-metrics');
const grpc = require('@grpc/grpc-js');
const { metricExporters, validateExporter } = require('./exporters');
const { metrics } = require('@opentelemetry/api');
const { sleep } = require('../util');

class OTelMetricsReporter {
  constructor(config, events, resource) {
    this.config = config;
    this.events = events;
    this.resource = resource;
    this.pendingRequests = 0;

    validateExporter(metricExporters, this.config.exporter, 'metric');

    this.configure(config);

    // Period metrics are provided by `stats` event
    this.events.on('stats', async (stats) => {
      this.pendingRequests += 1;

      // Set the start and end times
      let startTime = stats.firstMetricAt;
      let endTime = stats.lastMetricAt;
      this.config.attributes.startTime = startTime;
      this.config.attributes.endTime = endTime;

      // Record metrics
      this.recordCounters(stats.counters, this.config);
      this.recordRates(stats.rates, this.config);
      this.recordSummaries(stats.summaries, this.config);

      // Collect and export metrics (we call the _runOnce manually since we disabled the internal timer inside configureMetrics)
      await this.theReader._runOnce();

      this.pendingRequests -= 1;
    });
  }

  configure(config) {
    this.debug = require('debug')(`plugin:publish-metrics:${this.config.type}`);
    this.config = {
      exporter: config.exporter || 'otlp-http',
      meterName: config.meterName || 'Artillery.io_metrics',
      includeOnly: config.includeOnly || [],
      exclude: config.exclude || [],
      attributes: {
        ...(config.attributes || {})
      }
    };

    this.meterProvider = new MeterProvider({
      resource: this.resource
    });

    this.debug('Configuring Metric Exporter');

    // Setting configuration options for exporter
    this.exporterOpts = {
      temporalityPreference: AggregationTemporality.DELTA
    };
    if (config.endpoint) {
      this.exporterOpts.url = config.endpoint;
    }

    if (config.headers) {
      if (config.exporter === 'otlp-grpc') {
        const metadata = new grpc.Metadata();
        Object.entries(config.headers).forEach(([k, v]) => metadata.set(k, v));
        this.exporterOpts.metadata = metadata;
      } else {
        this.exporterOpts.headers = config.headers;
      }
    }

    this.exporter = metricExporters[this.config.exporter || 'otlp-http'](
      this.exporterOpts
    );

    this.theReader = new PeriodicExportingMetricReader({
      exporter: this.exporter
    });

    // Clear the reader's interval so it only collects and exports when we manually call it (otherwise we get duplicated reports causing incorrect aggregated data results)
    clearInterval(this.theReader._interval);

    this.meterProvider.addMetricReader(this.theReader);
    metrics.setGlobalMeterProvider(this.meterProvider);

    this.meter = this.meterProvider.getMeter(this.config.meterName);
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

  async cleanup() {
    while (this.pendingRequests > 0) {
      this.debug('Waiting for pending metric request ...');
      await sleep(500);
    }
    this.debug('Pending metric requests done');
    this.debug('Shutting the Reader down');
    await this.theReader.shutdown();
    this.debug('Shut down sucessfull');
  }
}

module.exports = {
  OTelMetricsReporter
};
