'use strict';

const got = require('got');
const debug = require('debug')('plugin:publish-metrics:dynatrace');

class DynatraceReporter {
  constructor(config, events) {
    this.config = {
      apiToken: config.apiToken,
      envUrl: config.envUrl,
      prefix: config.prefix || 'artillery.',
      excluded: config.excluded || [],
      includeOnly: config.includeOnly || [],
      dimensions: this.parseDimensions(config.dimensions)
    };

    if (!config.apiToken || !config.envUrl) {
      throw new Error(
        'Dynatrace API Access Token or Environment URL not specified. In order to send metrics to Dynatrace both `apiToken` and `envUrl` must be set'
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
        this.formPayload(counters, rates, summaries)
      );
      await this.sendRequest(this.ingestMetricsEndpoint, request);
    });
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

  formPayload(counters, rates, summaries) {
    const payload = `${[...counters, ...rates, ...summaries].join('\n')}`;
    return payload;
  }

  formRequest(payload) {
    const options = {
      headers: {
        'Content-Type': 'text/plain',
        Authorization: `Api-Token ${this.config.apiToken}`
      },
      body: payload
    };

    return options;
  }

  async sendRequest(url, options) {
    this.pendingRequests += 1;

    debug('Sending metrics to Dynatrace');
    try {
      const res = await got.post(url, options);

      if (res.statusCode !== 202) {
        debug(`Status Code: ${res.statusCode}, ${res.statusMessage}`);
      }
    } catch (err) {
      debug('An error occured when sending metrics to Dynatrace: ', err);
    }
    debug('Metrics sent to Dynatrace');

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
    console.log('cleaning up');
    return this.waitingForRequest().then(done);
  }
}

function createDynatraceReporter(config, events, script) {
  return new DynatraceReporter(config, events, script);
}

module.exports = {
  createDynatraceReporter
};
