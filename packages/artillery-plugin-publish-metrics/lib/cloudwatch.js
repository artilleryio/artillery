/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {
  CloudWatchClient,
  PutMetricDataCommand
} = require('@aws-sdk/client-cloudwatch');
const { attachScenarioHooks } = require('./util');
const debug = require('debug')('plugin:publish-metrics:cloudwatch');

class CloudWatchReporter {
  constructor(config, events, script) {
    this.options = {
      region: config.region || 'eu-west-1',
      namespace: config.namespace || 'artillery',
      name: config.name || 'loadtest',
    };

    this.cw = new CloudWatchClient(this.options);
    this.promises = [];

    events.on('stats', async (stats) => {
      const report = stats.report();
      debug({report}, 'stats event');

      this.putMetric('scenarios.created', report.scenariosCreated);
      this.putMetric('scenarios.completed', report.scenariosCompleted);
      this.putMetric('requests.completed', report.requestsCompleted);

      if (report.latency) {
        this.putMetric('latency.min', report.latency.min);
        this.putMetric('latency.max', report.latency.max);
        this.putMetric('latency.median', report.latency.median);
        this.putMetric('latency.p95', report.latency.p95);
        this.putMetric('latency.p99', report.latency.p99);
      }

      if (report.customStats) {
        Object.entries(report.customStats).forEach(([groupName, group]) => {
          Object.entries(group).forEach(([statName, value]) => {
            const key = `custom.${groupName}.${statName}`;
            this.putMetric(key, value);
          })
        });
      }

      if (report.counters) {
        Object.entries(report.counters).forEach(([name, value]) => {
          const key = `counters.${name}`;
          this.putMetric(key, value);
        })
      }
      let errorCount = 0;
      if (report.errors) {
        Object.keys(report.errors).forEach((errCode) => {
          const metricName = errCode
              .replace(/[^a-zA-Z0-9_]/g, '_');
          errorCount += report.errors[errCode];
          this.putMetric(`errors.${metricName}`, report.errors[errCode]);
        });
      }
      this.putMetric(`error_count`, errorCount);

      const codeCounts = {
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
        this.putMetric(`response.${codeFamily}`, codeCounts[codeFamily]);
      });

      if (report.rps) {
        this.putMetric('rps.mean', report.rps.mean);
        this.putMetric('rps.count', report.count);
      }
    });

    debug('init done');
  }

  cleanup(done) {
    debug('cleaning up');

    Promise.all(this.promises).then(() => {
      debug('cleaning up completed');
      done()
    });
  }

  putMetric(name, value) {
    debug({name, value}, 'putMetric');

    const promise = this.cw.send(new PutMetricDataCommand({
      MetricData: [
        {
          MetricName: name,
          Unit: "None",
          Value: isNaN(value) ? 0 : value,
          Dimensions: [
            {
              Name: 'Name',
              Value: this.options.name
            }
          ],
        },
      ],
      Namespace: this.options.namespace,
    }));

    this.promises.push(promise);
  }

}

function createCloudWatchReporter(config, events, script) {
  return new CloudWatchReporter(config, events, script);
}

module.exports = {
  createCloudWatchReporter
};
