const got = require('got');
const { sleep } = require('../util');
const debug = require('debug')('plugin:publish-metrics:splunk');

class SplunkReporter {
  constructor(config, events, script) {
    if (!config.accessToken) {
      throw new Error(
        'Splunk reporter: accessToken must be provided. More info in the docs (https://docs.art/reference/extensions/publish-metrics#splunk)'
      );
    }

    this.config = {
      realm: config.realm || 'us0',
      prefix: config.prefix || 'artillery.',
      excluded: config.excluded || [],
      includeOnly: config.includeOnly || [],
      accessToken: config.accessToken,
      dimensions: this.parseDimensions(config.dimensions)
    };

    if (config.event) {
      this.shouldSendEvent = config.event.send || true;

      // Event API endpoint requires request payload to be an array of objects
      this.eventOpts = [
        {
          eventType: config.event.eventType || 'Artillery_io_Test',
          dimensions: {
            target: script.config.target,
            ...this.parseDimensions(config.event.dimensions)
          },
          properties: this.parseDimensions(config.event.properties)
        }
      ];
    }

    this.ingestAPIMetricEndpoint = `https://ingest.${this.config.realm}.signalfx.com/v2/datapoint`;
    this.ingestAPIEventEndpoint = `https://ingest.${this.config.realm}.signalfx.com/v2/event`;

    this.pendingRequests = 0;

    events.on('stats', async (stats) => {
      debug('received stats event');
      const timestamp = Number(stats.period);

      const rates = this.formatRatesForSplunk(
        stats.rates,
        this.config,
        timestamp
      );
      const summaries = this.formatSummariesForSplunk(
        stats.summaries,
        this.config,
        timestamp
      );
      const counters = this.formatCountersForSplunk(
        stats.counters,
        this.config,
        timestamp
      );

      //rates and summaries are both gauges for Splunk, so we're combining them
      const gauge = rates.concat(summaries);
      const payload = { gauge, count: counters };

      await this.sendRequest(this.ingestAPIMetricEndpoint, payload, 'metrics');
    });

    this.startedEventSent = false;
    if (config.event && String(this.shouldSendEvent) !== 'false') {
      events.on('phaseStarted', async () => {
        debug('phaseStarted event fired');
        if (this.startedEventSent) {
          return;
        }
        const timestamp = Date.now();
        this.eventOpts[0].timestamp = timestamp;
        this.eventOpts[0].dimensions.phase = 'Test-Started';
        await this.sendRequest(
          this.ingestAPIEventEndpoint,
          this.eventOpts,
          'event'
        );

        this.startedEventSent = true;
      });
    }
  }

  formatCountersForSplunk(counters, config, timestamp) {
    const statCounts = [];

    for (const [name, value] of Object.entries(counters || {})) {
      if (!this.shouldSendMetric(name, config.excluded, config.includeOnly)) {
        continue;
      }

      const count = {
        metric: config.prefix + name,
        value,
        dimensions: config.dimensions,
        timestamp
      };

      statCounts.push(count);
    }

    return statCounts;
  }

  formatRatesForSplunk(rates, config, timestamp) {
    const statGauges = [];
    for (const [name, value] of Object.entries(rates || {})) {
      if (!this.shouldSendMetric(name, config.excluded, config.includeOnly)) {
        continue;
      }

      const gauge = {
        metric: config.prefix + name,
        value,
        dimensions: config.dimensions,
        timestamp
      };

      statGauges.push(gauge);
    }

    return statGauges;
  }

  formatSummariesForSplunk(summaries, config, timestamp) {
    const statGauges = [];
    for (const [name, values] of Object.entries(summaries || {})) {
      if (!this.shouldSendMetric(name, config.excluded, config.includeOnly)) {
        continue;
      }

      for (const [agreggation, value] of Object.entries(values)) {
        const gauge = {
          metric: `${config.prefix}${name}.${agreggation}`,
          value,
          dimensions: config.dimensions,
          timestamp
        };

        statGauges.push(gauge);
      }
    }

    return statGauges;
  }

  parseDimensions(dimensionList) {
    if (!dimensionList || (dimensionList && dimensionList.length === 0)) {
      return {};
    }

    const parsedDimensions = {};

    for (const item of dimensionList) {
      const [name, ...value] = item.split(':');
      parsedDimensions[name] = value.join(':');
    }

    return parsedDimensions;
  }

  formRequest(payload) {
    const options = {
      headers: {
        'X-SF-Token': this.config.accessToken
      },
      json: payload
    };

    return options;
  }

  async sendRequest(url, payload, type) {
    this.pendingRequests += 1;
    const options = this.formRequest(payload);

    debug(`Sending ${type} to Splunk`);
    try {
      const res = await got.post(url, options);
      debug(`Splunk API Response: ${res.statusCode} ${res.statusMessage}`);

      if (res.statusCode !== 200) {
        debug(`Status Code: ${res.statusCode}, ${res.statusMessage}`);
      }
    } catch (err) {
      debug('There has been an error: ', err);
    }
    debug(`${type[0].toUpperCase() + type.slice(1)} sent to Splunk`);

    this.pendingRequests -= 1;
  }

  // checks if metric should be sent by screening for it in the excluded and includeOnly lists
  shouldSendMetric(metricName, excluded, includeOnly) {
    if (excluded.includes(metricName)) {
      return;
    }

    if (includeOnly.length > 0 && !includeOnly.includes(metricName)) {
      return;
    }

    return true;
  }

  async waitingForRequest() {
    while (this.pendingRequests > 0) {
      debug('Waiting for pending request ...');
      await sleep(500);
    }

    debug('Pending requests done');
    return true;
  }

  cleanup(done) {
    if (this.startedEventSent) {
      const timestamp = Date.now();
      this.eventOpts[0].timestamp = timestamp;
      this.eventOpts[0].dimensions.phase = 'Test-Finished';

      this.sendRequest(this.ingestAPIEventEndpoint, this.eventOpts, 'event');
    }

    debug('cleaning up');
    return this.waitingForRequest().then(done);
  }
}

function createSplunkReporter(config, events, script) {
  return new SplunkReporter(config, events, script);
}

module.exports = {
  createSplunkReporter
};
