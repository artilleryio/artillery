const debug = require('debug')('plugin:publish-metrics:open-telemetry');
const { attachScenarioHooks } = require('../util');

const {
  SpanKind,
  SpanStatusCode,
  trace,
  metrics
} = require('@opentelemetry/api');
const { Resource } = require('@opentelemetry/resources');
const {
  SemanticResourceAttributes
} = require('@opentelemetry/semantic-conventions');

class OTelReporter {
  constructor(config, events, script) {
    this.script = script;
    this.events = events;

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

    this.resource = Resource.default().merge(
      new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]:
          config.serviceName || 'Artillery-test'
      })
    );

    // Metrics
    if (config.metrics) {
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
  }

  configureMetrics(config) {
    this.metricsConfig = {
      exporter: config.exporter || 'otlp-http',
      meterName: config.meterName || 'Artillery.io_metrics',
      prefix: config.prefix || 'artillery.',
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
      this.metricsExporterOpts.headers = config.headers;
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
    for (const [ratename, value] of Object.entries(rates || {})) {
      // console.log('name: ', ratename, '\nvalue: ', value);
      if (
        !this.shouldSendMetric(ratename, config.exclude, config.includeOnly)
      ) {
        continue;
      }
      const name = config.prefix + ratename;
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

      for (const [agreggation, value] of Object.entries(values)) {
        const metricName = `${name}.${agreggation}`; // probably remove prefix for convention reasons
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
