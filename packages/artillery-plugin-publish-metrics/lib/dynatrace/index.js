'use strict';

const got = require('got');
const debug = require('debug')('plugin:publish-metrics:dynatrace');

class DynatraceReporter {
  constructor(config, events, script) {
    if (!config.apiToken || !config.envUrl) {
      throw new Error(
        'Dynatrace reporter: both apiToken and envUrl must be set. More info in the docs (https://docs.art/reference/extensions/publish-metrics#dynatrace)'
      );
    }

    this.config = {
      apiToken: config.apiToken,
      envUrl: config.envUrl,
      prefix: config.prefix || 'artillery.',
      excluded: config.excluded || [],
      includeOnly: config.includeOnly || [],
      dimensions: this.parseDimensions(config.dimensions)
    };

    // Configure event if set - if event key is set but its value isn't we use defaults
    if (config.hasOwnProperty('event')) {
      this.eventConfig = {
        properties: config.event?.properties || [],
        send: config.event?.send || true,
        entitySelector: config.event?.entitySelector
      };

      this.eventOpts = {
        eventType: config.event?.eventType || 'CUSTOM_INFO',
        title: config.event?.title || 'Artillery_io_test',
        startTime: 0,
        endTime: 0,
        properties: {
          Target: script.config.target,
          ...this.parseProperties(this.eventConfig.properties)
        }
      };

      if (this.eventConfig.entitySelector) {
        this.eventOpts.entitySelector = String(this.eventConfig.entitySelector);
      }

      this.ingestEventsEndpoint = new URL(
        '/api/v2/events/ingest',
        this.config.envUrl
      );
    }

    this.ingestMetricsEndpoint = new URL(
      '/api/v2/metrics/ingest',
      this.config.envUrl
    );

    this.pendingRequests = 0;

    events.on('stats', async (stats) => {
      const timestamp = Date.now();
      const counters = this.formatCountersForDynatrace(
        stats.counters,
        this.config,
        timestamp
      );

      const rates = this.formatRatesForDynatrace(
        stats.rates,
        this.config,
        timestamp
      );
      const summaries = this.formatSummariesForDynatrace(
        stats.summaries,
        this.config,
        timestamp
      );

      const request = this.formRequest(
        this.formMetricsPayload(counters, rates, summaries)
      );
      await this.sendRequest(this.ingestMetricsEndpoint, request);
    });

    this.startedEventSent = false;
    if (this.eventConfig && String(this.eventConfig.send) !== 'false') {
      events.on('phaseStarted', async () => {
        debug('phaseStarted event fired');
        if (this.startedEventSent) {
          return;
        }
        const timestamp = Date.now();
        this.eventOpts.startTime = timestamp;
        this.eventOpts.endTime = timestamp + 1;
        this.eventOpts.properties.Phase = 'Test-Started';

        await this.sendRequest(
          this.ingestEventsEndpoint,
          this.formRequest(JSON.stringify(this.eventOpts), 'event'),
          'event'
        );

        this.startedEventSent = true;
      });
    }
  }

  parseDimensions(dimensionList) {
    if (!dimensionList || (dimensionList && dimensionList.length === 0)) {
      return false;
    }
    const parsedDimensions = [];

    for (const item of dimensionList) {
      const [name, value] = item.split(':');
      parsedDimensions.push(`${name}="${value}"`);
    }

    return parsedDimensions;
  }

  parseProperties(propertyList) {
    if (!propertyList || (propertyList && propertyList.length === 0)) {
      return false;
    }
    const parsedProperties = {};

    for (const item of propertyList) {
      const [name, value] = item.split(':');
      parsedProperties[name] = value;
    }

    return parsedProperties;
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

  formatCountersForDynatrace(counters, config, timestamp) {
    debug('Formating counters for Dynatrace');
    const statCounts = [];

    for (const [name, value] of Object.entries(counters || {})) {
      if (!this.shouldSendMetric(name, config.excluded, config.includeOnly)) {
        continue;
      }

      const count = `${config.prefix}${name},${config.dimensions.join(
        ','
      )} count,delta=${value} ${timestamp}`;

      statCounts.push(count);
    }

    return statCounts;
  }

  formatRatesForDynatrace(rates, config, timestamp) {
    const statGauges = [];
    for (const [name, value] of Object.entries(rates || {})) {
      if (!this.shouldSendMetric(name, config.excluded, config.includeOnly)) {
        continue;
      }

      const gauge = `${config.prefix + name},${config.dimensions.join(
        ','
      )} gauge,${value} ${timestamp}`;
      statGauges.push(gauge);
    }

    return statGauges;
  }

  formatSummariesForDynatrace(summaries, config, timestamp) {
    const statGauges = [];
    for (const [name, values] of Object.entries(summaries || {})) {
      if (!this.shouldSendMetric(name, config.excluded, config.includeOnly)) {
        continue;
      }
      for (const [agreggation, value] of Object.entries(values)) {
        const gauge = `${
          config.prefix
        }${name}.${agreggation},${config.dimensions.join(
          ','
        )} gauge,${value} ${timestamp}`;

        statGauges.push(gauge);
      }
    }

    return statGauges;
  }

  formMetricsPayload(counters, rates, summaries) {
    const payload = `${[...counters, ...rates, ...summaries].join('\n')}`;
    return payload;
  }

  formRequest(payload, type = 'metrics') {
    const options = {
      headers: {
        'Content-Type': type === 'event' ? 'application/json' : 'text/plain',
        Authorization: `Api-Token ${this.config.apiToken}`
      },
      body: payload
    };

    return options;
  }

  async sendRequest(url, options, type = 'metrics') {
    this.pendingRequests += 1;

    debug(`Sending ${type} to Dynatrace`);
    try {
      const res = await got.post(url, options);

      if (type === 'metrics' && res.statusCode !== 202) {
        debug(
          `Dynatrace Metric API response status: ${res.statusCode}, ${res.statusMessage}`
        );
      }

      if (type === 'event') {
        debug(
          `Dynatrace Event API response status: ${res.statusCode}, ${res.statusMessage}`
        );
        debug(`Dynatrace EventIngestResult: ${res.body}`);
      }
    } catch (err) {
      debug(`There has been an error in sending ${type} to Dynatrace: `, err);
    }
    debug(`${type[0].toUpperCase() + type.slice(1)} sent to Dynatrace`);

    this.pendingRequests -= 1;
  }

  async waitingForRequest() {
    while (this.pendingRequests > 0) {
      debug('Waiting for pending request ...');
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    debug('Pending requests done');
    return true;
  }

  cleanup(done) {
    if (this.startedEventSent) {
      const timestamp = Date.now();
      this.eventOpts.startTime = timestamp;
      this.eventOpts.endTime = timestamp + 1;
      this.eventOpts.properties.Phase = 'Test-Finished';

      this.sendRequest(
        this.ingestEventsEndpoint,
        this.formRequest(JSON.stringify(this.eventOpts), 'event'),
        'event'
      );
    }

    debug('Cleaning up');
    return this.waitingForRequest().then(done);
  }
}

function createDynatraceReporter(config, events, script) {
  return new DynatraceReporter(config, events, script);
}

module.exports = {
  createDynatraceReporter
};
