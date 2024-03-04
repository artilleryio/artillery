/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {
  CloudWatchClient,
  PutMetricDataCommand
} = require('@aws-sdk/client-cloudwatch');
const debug = require('debug')('plugin:publish-metrics:cloudwatch');

const { sleep } = require('./util');

const COUNTERS_STATS = 'counters'; // counters stats
const RATES_STATS = 'rates'; // rates stats
const SUMMARIES_STATS = 'summaries'; // summaries stats

const DEFAULT_UNIT = 'Count';

const DEFAULT_STATS_ALLOWED = ['p99', 'max', 'min', 'median', 'count'];

const STATS_KEYS = ['p50', 'p75', 'p95', 'p99', 'p999', 'max', 'min', 'median'];

const KNOWN_METRICS = [
  'http.response_time',
  'http.tls',
  'http.tcp',
  'http.dns',
  'http.total',
  'vusers.session_length'
];

const KNOWN_UNITS = {
  [SUMMARIES_STATS]: KNOWN_METRICS.reduce((acc, key) => {
    acc[key] = {};
    STATS_KEYS.forEach((metric) => {
      acc[key][metric] = 'Milliseconds';
    });
    return acc;
  }, {}),
  [RATES_STATS]: {
    'http.request_rate': 'Count/Second'
  }
};

class CloudWatchReporter {
  constructor(config, events) {
    this.options = {
      region: config.region || 'eu-west-1',
      namespace: config.namespace || 'artillery',
      name: config.name || 'loadtest',
      dimensions: config.dimensions || [],
      extended: config.extended || false,
      excluded: config.excluded || [],
      includeOnly: config.includeOnly || []
    };

    this.pendingRequests = 0;
    this.cw = new CloudWatchClient({
      region: this.options.region
    });
    this.metrics = [];

    events.on('stats', async (stats) => {
      if (stats[COUNTERS_STATS]) {
        for (const cKey in stats[COUNTERS_STATS]) {
          this.addMetric(`${cKey}`, stats[COUNTERS_STATS][cKey], DEFAULT_UNIT);
        }
      }

      if (stats[RATES_STATS]) {
        for (const rKey in stats[RATES_STATS]) {
          this.addMetric(
            `${rKey}`,
            stats[RATES_STATS][rKey],
            (KNOWN_UNITS[RATES_STATS] && KNOWN_UNITS[RATES_STATS][rKey]) ||
              DEFAULT_UNIT
          );
        }
      }

      if (stats[SUMMARIES_STATS]) {
        for (const sKey in stats[SUMMARIES_STATS]) {
          let readings = stats[SUMMARIES_STATS][sKey];
          for (const readingKey in readings) {
            if (
              this.options.extended ||
              DEFAULT_STATS_ALLOWED.includes(readingKey.split('.').pop())
            ) {
              this.addMetric(
                `${sKey}.${readingKey}`,
                readings[readingKey],
                (KNOWN_UNITS[SUMMARIES_STATS] &&
                  KNOWN_UNITS[SUMMARIES_STATS][sKey] &&
                  KNOWN_UNITS[SUMMARIES_STATS][sKey][readingKey]) ||
                  DEFAULT_UNIT
              );
            }
          }
        }
      }

      await this.putMetric();
    });

    debug('init done');
  }

  isMetricValid(value) {
    return (
      value !== undefined && value !== null && !isNaN(value) && isFinite(value)
    );
  }

  addMetric(name, value, unit = DEFAULT_UNIT) {
    // ignore undefined values
    if (!this.isMetricValid(value)) {
      return;
    }
    if (this.options.excluded.includes(name)) {
      return;
    }

    if (
      this.options.includeOnly.length > 0 &&
      !this.options.includeOnly.includes(name)
    ) {
      return;
    }

    const metric = {
      MetricName: name,
      Unit: unit,
      Value: value
    };
    debug(
      {
        metric,
        pid: process.pid,
        isMaster: require('cluster').isMaster
      },
      'addMetric'
    );

    this.metrics.push({
      Dimensions: [
        {
          Name: 'Name',
          Value: this.options.name
        },
        ...this.options.dimensions.map((dimension) => ({
          Name: dimension.name,
          Value: dimension.value
        }))
      ],
      ...metric
    });
  }

  async putMetric() {
    this.pendingRequests += 1;
    const metrics = this.metrics;
    this.metrics = [];

    // debug('putMetric', metrics);
    try {
      await this.cw.send(
        new PutMetricDataCommand({
          MetricData: metrics,
          Namespace: this.options.namespace
        })
      );
    } catch (error) {
      debug(error);
    }

    this.pendingRequests -= 1;
  }

  async waitingForRequest() {
    do {
      debug('Waiting for pending request ...');
      await sleep(500);
    } while (this.pendingRequests > 0);

    debug('Pending requests done');
    return true;
  }

  cleanup(done) {
    debug('cleaning up');
    return this.waitingForRequest().then(done);
  }
}

function createCloudWatchReporter(config, events, script) {
  return new CloudWatchReporter(config, events, script);
}

module.exports = {
  createCloudWatchReporter
};
