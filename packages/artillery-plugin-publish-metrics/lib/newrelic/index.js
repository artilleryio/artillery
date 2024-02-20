const got = require('got');
const { sleep } = require('../util');
const debug = require('debug')('plugin:publish-metrics:newrelic');

class NewRelicReporter {
  constructor(config, events, script) {
    if (!config.licenseKey) {
      throw new Error(
        'New Relic reporter: licenseKey must be provided. More info in the docs (https://docs.art/reference/extensions/publish-metrics#newrelic)'
      );
    }
    if (config.sendOnlyTraces || config.traces?.sendOnlyTraces) {
      this.onlyTraces = true;
      debug('sendOnlyTraces is true, not initializing metrics');
      return this;
    }

    // Set each config value as matching user config if exists, else default values
    this.config = {
      region: config.region || 'us',
      prefix: config.prefix || 'artillery.',
      excluded: config.excluded || [],
      includeOnly: config.includeOnly || [],
      attributes: config.attributes || [],
      licenseKey: config.licenseKey
    };

    if (config.hasOwnProperty('event') && !config.event?.accountId) {
      throw new Error(
        'New Relic account ID not specified. In order to send events to New Relic `accountId` must be provided'
      );
    }

    if (config.event) {
      this.eventConfig = {
        attributes: config.event.attributes || [],
        send: config.event.send || true,
        accountId: config.event.accountId
      };

      this.eventOpts = {
        eventType: config.event.eventType || 'Artillery_io_Test',
        target: `${script.config.target}`,
        ...this.parseAttributes(this.eventConfig.attributes)
      };

      this.eventsAPIEndpoint =
        this.config.region === 'eu'
          ? `https://insights-collector.eu01.nr-data.net/v1/accounts/${this.eventConfig.accountId}/events`
          : `https://insights-collector.newrelic.com/v1/accounts/${this.eventConfig.accountId}/events`;
    }

    this.metricsAPIEndpoint =
      this.config.region === 'eu'
        ? 'https://metric-api.eu.newrelic.com/metric/v1'
        : 'https://metric-api.newrelic.com/metric/v1';

    this.pendingRequests = 0;

    events.on('stats', async (stats) => {
      const timestamp = Date.now();
      const interval =
        Number(stats.lastCounterAt) - Number(stats.firstCounterAt);

      const rates = this.formatRatesForNewRelic(stats.rates, this.config);
      const counters = this.formatCountersForNewRelic(
        stats.counters,
        this.config
      );
      const summaries = this.formatSummariesForNewRelic(
        stats.summaries,
        this.config
      );

      const reqBody = this.createRequestBody(
        timestamp,
        interval,
        this.config.attributes,
        [...rates, ...counters, ...summaries]
      );
      await this.sendStats(
        this.metricsAPIEndpoint,
        this.config.licenseKey,
        reqBody
      );
    });

    this.startedEventSent = false;
    if (config.event && String(this.eventConfig.send) !== 'false') {
      events.on('phaseStarted', async () => {
        debug('phaseStarted event fired');
        if (this.startedEventSent) {
          return;
        }
        const timestamp = Date.now();
        this.eventOpts.timestamp = timestamp;
        this.eventOpts.phase = 'Test Started';
        await this.sendEvent(
          this.eventsAPIEndpoint,
          this.config.licenseKey,
          this.eventOpts
        );
        this.startedEventSent = true;
      });
    }
  }

  // Packs stats.counters metrics that need to be sent to NR into format recognised by NR metric API
  formatCountersForNewRelic(counters, config) {
    const statMetrics = [];
    for (const [name, value] of Object.entries(counters || {})) {
      if (!this.shouldSendMetric(name, config.excluded, config.includeOnly)) {
        continue;
      }

      const metric = {
        name: config.prefix + name,
        type: 'count',
        value
      };
      statMetrics.push(metric);
    }

    return statMetrics;
  }

  // Packs stats.rates metrics that need to be sent to NR into format recognised by NR metric API
  formatRatesForNewRelic(rates, config) {
    const statMetrics = [];
    for (const [name, value] of Object.entries(rates || {})) {
      if (!this.shouldSendMetric(name, config.excluded, config.includeOnly)) {
        continue;
      }

      const metric = {
        name: config.prefix + name,
        type: 'gauge',
        value
      };
      statMetrics.push(metric);
    }

    return statMetrics;
  }

  // Packs stats.summaries metrics that need to be sent to NR into format recognised by NR metric API
  formatSummariesForNewRelic(summaries, config) {
    const statMetrics = [];
    for (const [name, values] of Object.entries(summaries || {})) {
      if (!this.shouldSendMetric(name, config.excluded, config.includeOnly)) {
        continue;
      }

      for (const [aggregation, value] of Object.entries(values)) {
        const metric = {
          name: `${config.prefix}${name}.${aggregation}`,
          type: 'gauge',
          value
        };
        statMetrics.push(metric);
      }
    }

    return statMetrics;
  }

  parseAttributes(attributeList) {
    const parsedAttributes = {};
    if (attributeList.length > 0) {
      for (const item of attributeList) {
        const [name, ...value] = item.split(':');
        parsedAttributes[name] = value.join(':');
      }
    }
    return parsedAttributes;
  }

  // Assembles metrics and info into req body format needed by NR metric API
  createRequestBody(timestamp, interval, attributeList, metrics) {
    const body = [
      {
        common: {
          timestamp,
          'interval.ms': interval,
          attributes: this.parseAttributes(attributeList)
        },
        metrics
      }
    ];

    return body;
  }

  async sendStats(url, licenseKey, body) {
    this.pendingRequests += 1;
    const headers = {
      'Content-Type': 'application/json; charset=UTF-8',
      'Api-Key': licenseKey
    };
    const options = {
      headers,
      json: body
    };

    debug('Sending metrics to New Relic');
    try {
      const res = await got.post(url, options);

      if (res.statusCode !== 202) {
        debug(`Status Code: ${res.statusCode}, ${res.statusMessage}`);
      }

      // In case an error is generated during the Metric API asynchronous check (after succesfull response), requestId can be used to match error to request
      debug(
        `Request to Metric API at ${body[0].common.timestamp} requestId: `,
        JSON.parse(res.body).requestId
      );
    } catch (err) {
      debug(err);
    }

    this.pendingRequests -= 1;
  }

  // Checks if metric should be sent by screening for it in the excluded and includeOnly lists
  shouldSendMetric(metricName, excluded, includeOnly) {
    if (excluded.includes(metricName)) {
      return;
    }

    if (includeOnly.length > 0 && !includeOnly.includes(metricName)) {
      return;
    }

    return true;
  }

  async sendEvent(url, licenseKey, eventOptions) {
    this.pendingRequests += 1;
    const headers = {
      'Content-Type': 'application/json; charset=UTF-8',
      'Api-Key': licenseKey
    };

    const options = {
      headers,
      json: eventOptions
    };

    debug('Sending ' + eventOptions.phase + ' event to New Relic');
    try {
      const res = await got.post(url, options);

      if (res.statusCode !== 200) {
        debug(`Status Code: ${res.statusCode}, ${res.statusMessage}`);
      }

      // In case an error is generated during the Event API asynchronous check (after succesfull response), UUID can be used to match error to request
      debug(
        `Request to Event API at ${eventOptions.timestamp} Request UUID: `,
        JSON.parse(res.body).uuid
      );
      debug(eventOptions.phase + ' event sent to New Relic');
    } catch (err) {
      debug(err);
    }

    this.pendingRequests -= 1;
  }

  async waitingForRequest() {
    while (this.pendingRequests > 0) {
      debug('Waiting for pending request...');
      await sleep(500);
    }

    debug('Pending requests done');
    return true;
  }

  cleanup(done) {
    if (this.onlyTraces) {
      return done();
    }

    if (this.startedEventSent) {
      const timestamp = Date.now();
      this.eventOpts.timestamp = timestamp;
      this.eventOpts.phase = 'Test Finished';

      this.sendEvent(
        this.eventsAPIEndpoint,
        this.config.licenseKey,
        this.eventOpts
      );
    }

    debug('Cleaning up');
    return this.waitingForRequest().then(done);
  }
}

function createNewRelicReporter(config, events, script) {
  return new NewRelicReporter(config, events, script);
}

module.exports = {
  createNewRelicReporter
};
