/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const datadogMetrics = require('datadog-metrics');
const dogapi = require('dogapi');
const Hotshots = require('hot-shots');
const debug = require('debug')('plugin:publish-metrics:datadog-statsd');

function DatadogReporter(config, events, script) {
  this.onlyTraces = config.traces?.sendOnlyTraces;
  if (this.onlyTraces) {
    debug('sendOnlyTraces is true, not initializing metrics');
    return this;
  }
  this.metrics = null;
  this.dogapi = dogapi;
  this.reportingType = ''; // api | agent (DogStatsD, StatsD, Telegraf/StatsD)

  this.excluded = config.excluded || [];
  this.includeOnly = config.includeOnly || [];

  config = Object.assign(
    {
      host: '127.0.0.1',
      port: 8125,
      prefix: 'artillery.',
      event: { send: true },
      tags: []
    },
    config
  );

  config.event = Object.assign(
    {
      title: `Artillery.io Test ${Date.now()}`,
      text: `Target: ${script.config.target}`,
      priority: 'low',
      alertType: 'info',
      tags: []
    },
    config.event
  );

  debug('creating DatadogReporter with config');
  debug(
    config.apiKey || config.appKey
      ? Object.assign(
          { apiKey: sanitize(config.apiKey), appKey: sanitize(config.appKey) },
          config
        )
      : config
  );

  this.config = config;
  if (config.apiKey) {
    debug('Initializing datadog via HTTPS');

    this.metrics = new datadogMetrics.BufferedMetricsLogger({
      apiKey: config.apiKey,
      appKey: config.appKey,
      apiHost: config.apiHost,
      prefix: config.prefix,
      defaultTags: config.tags,
      flushIntervalSeconds: 5
    });

    this.reportingType = 'api';
  } else {
    debug('Initializing datadog via agent');

    const options = {
      host: config.host,
      port: config.port,
      prefix: config.prefix,
      globalTags: config.tags,
      bufferFlushInterval: 1000
    };

    if (config.type === 'influxdb-statsd') {
      options.telegraf = true;
    }

    this.metrics = new Hotshots(options);
    this.reportingType = 'agent';
  }

  this.startedEventSent = false;
  if (config.event && String(config.event.send) !== 'false') {
    if (this.reportingType === 'api') {
      this.dogapi.initialize({
        api_key: config.apiKey,
        app_key: config.appKey
      });
    }

    events.on('phaseStarted', () => {
      if (!this.startedEventSent) {
        debug('sending start event');
        this.event({
          title: `Started: ${config.event.title}`,
          text: config.event.text,
          aggregationKey: config.event.aggregationKey,
          sourceTypeName: config.event.sourceTypeName,
          priority: config.event.priority,
          tags: config.event.tags,
          alertType: config.event.alertType
        });
        this.startedEventSent = true;
      }
    });
  }

  events.on('stats', (stats) => {
    for (const [name, value] of Object.entries(stats.counters || {})) {
      if (this.shouldSendMetric(name)) {
        this.metrics.increment(name, value);
      }
    }

    /*
      An entry looks like this:

      "http.response_time": {
        "min": 16,
        "max": 438,
        "count": 150,
        "p50": 19.9,
        "median": 19.9,
        "p75": 22.9,
        "p90": 26.8,
        "p95": 44.3,
        "p99": 333.7,
        "p999": 383.8
      }

      so we create gauges such as: http.response_time.p50 = 19.9
     */
    for (const [name, values] of Object.entries(stats.summaries || {})) {
      for (const [aggregation, value] of Object.entries(values)) {
        if (this.shouldSendMetric(name)) {
          this.metrics.gauge(`${name}.${aggregation}`, value);
        }
      }
    }

    for (const [name, value] of Object.entries(stats.rates || {})) {
      if (this.shouldSendMetric(name)) {
        this.metrics.gauge(name, value);
      }
    }
  });

  return this;
}

DatadogReporter.prototype.shouldSendMetric = function (metricName) {
  if (this.includeOnly.length === 0 && this.excluded.length === 0) {
    return true;
  }

  if (this.includeOnly.length > 0) {
    return matchesPattern(metricName, this.includeOnly);
  }

  return !matchesPattern(metricName, this.excluded);
};

DatadogReporter.prototype.event = function (opts) {
  debug(`sending event ${opts.text || opts.title}`);

  const eventOpts = {
    aggregation_key: opts.aggregationKey,
    priority: opts.priority,
    source_type_name: opts.sourceTypeName,
    alert_type: opts.alertType
  };

  if (this.reportingType === 'api') {
    this.dogapi.event.create(
      opts.title,
      opts.text || opts.title,
      Object.assign({ tags: opts.tags }, eventOpts),
      (err, res) => {
        if (err) {
          debug(err);
        }
        if (res.status !== 'ok') {
          // A non-JSON response can be sent back when API key is not valid
          // See https://github.com/DataDog/datadogpy/issues/169
          debug(res);
        }
      }
    );
  } else {
    this.metrics.event(
      opts.title,
      opts.text || opts.title,
      eventOpts,
      opts.tags,
      (err) => {
        if (err) {
          debug('hotshots event callback');
          debug(err);
        }
      }
    );
  }
};

DatadogReporter.prototype.cleanup = function (done) {
  if (this.startedEventSent) {
    const config = this.config;
    this.event({
      title: `Finished: ${config.event.title}`,
      text: config.event.text,
      aggregationKey: config.event.aggregationKey,
      sourceTypeName: config.event.sourceTypeName,
      priority: config.event.priority,
      tags: config.event.tags,
      alertType: config.event.alertType
    });
  }

  if (this.onlyTraces) {
    return done();
  }
  debug('flushing metrics');
  if (typeof this.metrics.flush === 'function') {
    this.metrics.flush((_err) => {
      done();
    });
  } else {
    setTimeout(
      () => {
        this.metrics.close((_err) => {
          done();
        });
      },
      // see bufferFlushInterval above, needs to be higher; close()
      // doesn't flush (yet)
      1500
    );
  }
};

function createDatadogReporter(config, events, script) {
  return new DatadogReporter(config, events, script);
}

function sanitize(str) {
  if (!str) {
    return str;
  }
  return `${str.substring(0, 3)}********************${str.substring(
    str.length - 3,
    str.length
  )}`;
}

function matchesPattern(str, filters) {
  let result = false;

  for (const filterPattern of filters) {
    if (str.startsWith(filterPattern)) {
      result = true;
      break;
    }
  }

  return result;
}

module.exports = {
  createDatadogReporter
};
