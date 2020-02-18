/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const datadogMetrics = require('datadog-metrics');
const dogapi = require('dogapi');
const Hotshots = require('hot-shots');
const debug = require('debug')('plugin:publish-metrics:datadog-statsd');

function DatadogReporter(config, events, script) {
  this.metrics = null;
  this.dogapi = dogapi;
  this.reportingType = ''; // api | agent (DogStatsD, StatsD, Telegraf/StatsD)

  config = Object.assign({
    host: '127.0.0.1',
    port: 8125,
    prefix: 'artillery.',
    event: { send: false },
    tags: []
  }, config);

  config.event = Object.assign(
    {
      title: `Artillery.io Test ${Date.now()}`,
      text: `Target: ${script.config.target}`,
      priority: 'low',
      alertType: 'info',
      tags: []
    },
    config.event);

  debug('creating DatadogReporter with config');
  debug(config.apiKey ?
        Object.assign({ apiKey: sanitize(config.apiKey) }, config) :
        config);

  this.config = config;
  if (config.apiKey) {
    debug('Initializing datadog via HTTPS');

    this.metrics = new datadogMetrics.BufferedMetricsLogger({
      apiKey: config.apiKey,
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
  if (config.event && String(config.event.send) !== "false") {
    if (this.reportingType === 'api') {
      this.dogapi.initialize({
        api_key: config.apiKey
      });
    }

    events.on('phaseStarted', () => {
      if(!this.startedEventSent) {
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
    const report = stats.report();

    let metrics = this.metrics;

    metrics.increment('scenarios.created', report.scenariosCreated);
    metrics.increment('scenarios.completed', report.scenariosCompleted);
    metrics.increment('requests.completed', report.requestsCompleted);

    if (report.latency) {
      metrics.gauge('latency.min', report.latency.min);
      metrics.gauge('latency.max', report.latency.max);
      metrics.gauge('latency.median', report.latency.median);
      metrics.gauge('latency.p95', report.latency.p95);
      metrics.gauge('latency.p99', report.latency.p99);
    }

    let errorCount = 0;
    if (report.errors) {
      Object.keys(report.errors).forEach((errCode) => {
        errorCount += report.errors[errCode];
        metrics.increment(`errors.${errCode}`, report.errors[errCode]);
      });
    }
    metrics.increment(`error_count`, errorCount);

    let codeCounts = {
      '1xx': 0,
      '2xx': 0,
      '3xx': 0,
      '4xx': 0,
      '5xx': 0
    };
    if (report.codes) {
      Object.keys(report.codes).forEach((code) => {
        const codeFamily = `${String(code)[0]}xx`;
        if (!codeCounts[codeFamily]) {
          codeCounts[codeFamily] = 0; // 6xx etc
        }
        codeCounts[codeFamily] += report.codes[code];
      });
    }
    Object.keys(codeCounts).forEach((codeFamily) => {
      metrics.increment(`response.${codeFamily}`, codeCounts[codeFamily]);
    });

    if (report.rps) {
      metrics.gauge('rps.mean', report.rps.mean);
      metrics.increment('rps.count', report.count);
    }
  });

  return this;
}

DatadogReporter.prototype.event = function(opts) {
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
      });
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

DatadogReporter.prototype.cleanup = function(done) {
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
      1500);
  }
};


function createDatadogReporter(config, events, script) {
  return new DatadogReporter(config, events, script);
}

function sanitize(str) {
  return `${str.substring(0, 3)}********************${str.substring(str.length - 3, str.length)}`;
}

module.exports = {
  createDatadogReporter
};
