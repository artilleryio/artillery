const got = require("got");
const debug = require("debug")("plugin:publish-metrics:splunk");

class SplunkReporter {
  constructor(config, events) {
    this.config = {
      realm: config.realm || "us0",
      prefix: config.prefix || "artillery.",
      excluded: config.excluded || [],
      includeOnly: config.includeOnly || [],
      accessToken: config.accessToken,
    };

    this.config.dimensions = this.parseDimensions(config.dimensions);
    this.ingestAPIEndpoint = `https://ingest.${ this.config.realm }.signalfx.com/v2/datapoint`;

    this.pendingRequests = 0;

    events.on("stats", async (stats) => {
      debug("received stats event");
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
      const gauges = rates.concat(summaries);

      await this.sendStats(
        this.ingestAPIEndpoint,
        this.config.accessToken,
        gauges,
        counters
      );
    });
  };

  formatCountersForSplunk(counters, config, timestamp) {
    const statCounts = [];

    for (const [name, value] of Object.entries(counters || {})) {
      if (!this.shouldSendMetric(name, config.excluded, config.includeOnly)) {
        continue;
      };

      const count = {
        metric: config.prefix + name,
        value,
        dimensions: config.dimensions,
        timestamp,
      };

      statCounts.push(count);
    };

    return statCounts;
  };

  formatRatesForSplunk(rates, config, timestamp) {
    const statGauges = [];
    for (const [name, value] of Object.entries(rates || {})) {
      if (!this.shouldSendMetric(name, config.excluded, config.includeOnly)) {
        continue;
      };

      const gauge = {
        metric: config.prefix + name,
        value,
        dimensions: config.dimensions,
        timestamp,
      };

      statGauges.push(gauge);
    };

    return statGauges;
  };

  formatSummariesForSplunk(summaries, config, timestamp) {
    const statGauges = [];
    for (const [name, values] of Object.entries(summaries || {})) {
      if (!this.shouldSendMetric(name, config.excluded, config.includeOnly)) {
        continue;
      };

      for (const [agreggation, value] of Object.entries(values)) {
        const gauge = {
          metric: `${ config.prefix }${ name }.${ agreggation }`,
          value,
          dimensions: config.dimensions,
          timestamp,
        };

        statGauges.push(gauge);
      };
    };

    return statGauges;
  }

  parseDimensions(dimensionList) {
    if (!dimensionList || dimensionList && dimensionList.length === 0) {
      return {};
    };

    const parsedDimensions = {};

    for (const item of dimensionList) {
      const dimension = item.split(":");
      parsedDimensions[dimension[0]] = dimension[1];
    };

    return parsedDimensions;
  };

  async sendStats(url, token, gaugeArray, counterArray) {
    const headers = {
      "Content-Type": "application/json; charset=UTF-8",
      "X-SF-Token": token,
    };

    const options = {
      headers,
      json: {
        gauge: gaugeArray,
        count: counterArray,
      },
    };

    this.pendingRequests += 1;

    debug("sending metrics to Splunk");
    try {
      const res = await got.post(url, options);
      if (res.statusCode !== 200) {
        debug(`Status Code: ${ res.statusCode }, ${ res.statusMessage }`);
      };
    } catch (err) {
      debug(err);
    };

    this.pendingRequests -= 1;
  };

  // checks if metric should be sent by screening for it in the excluded and includeOnly lists
  shouldSendMetric(metricName, excluded, includeOnly) {
    if (excluded.includes(metricName)) {
      return;
    };

    if (includeOnly.length > 0 && !includeOnly.includes(metricName)) {
      return;
    };

    return true;
  };

  async waitingForRequest() {
    while (this.pendingRequests > 0) {
      debug("Waiting for pending request ...");
      await new Promise((resolve) => setTimeout(resolve, 500));
    };

    debug("Pending requests done");
    return true;
  };

  cleanup(done) {
    debug("cleaning up");
    return this.waitingForRequest().then(done);
  };
};

function createSplunkReporter(config, events, script) {
  return new SplunkReporter(config, events, script);
};

module.exports = {
  createSplunkReporter,
};
