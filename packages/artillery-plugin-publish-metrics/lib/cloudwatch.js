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
      allowedStats: config.allowedStats || ['customStats']
    };

    this.cw = new CloudWatchClient(this.options);
    this.promises = [];
    this.metrics = [];

    events.on('stats', async (stats, b) => {
      const statsReport = stats.report();
      const report = this.options.allowedStats
          .map((stat) => ({name: stat, value: statsReport[stat]}))
          .reduce((p, c) => {
            p[c.name] = c.value;
            return p;
          }, {});

      this.addMetric('scenarios.created', report.scenariosCreated);
      this.addMetric('scenarios.completed', report.scenariosCompleted);
      this.addMetric('requests.completed', report.requestsCompleted);

      if (report.latency) {
        this.addMetric('latency.min', report.latency.min);
        this.addMetric('latency.max', report.latency.max);
        this.addMetric('latency.median', report.latency.median);
        this.addMetric('latency.p95', report.latency.p95);
        this.addMetric('latency.p99', report.latency.p99);
      }

      if (report.customStats) {
        Object.entries(report.customStats).forEach(([groupName, group]) => {
          Object.entries(group)
              .filter(([statName, value]) => ['min', 'max', 'median'].includes(statName))
              .forEach(([statName, value]) => {
                const key = `custom.${groupName}.${statName}`;
                // this.addMetric(key, value);
              })
        });
      }

      if (report.counters) {
        Object.entries(report.counters).forEach(([name, value]) => {
          const key = `counters.${name}`;
          this.addMetric(key, value);
        })
      }
      let errorCount = 0;
      if (report.errors) {
        Object.keys(report.errors).forEach((errCode) => {
          const metricName = errCode
              .replace(/[^a-zA-Z0-9_]/g, '_');
          errorCount += report.errors[errCode];
          this.addMetric(`errors.${metricName}`, report.errors[errCode]);
        });
        this.addMetric(`error_count`, errorCount);
      }

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
        Object.keys(codeCounts).forEach((codeFamily) => {
          this.addMetric(`response.${codeFamily}`, codeCounts[codeFamily]);
        });
      }

      if (report.rps) {
        this.addMetric('rps.mean', report.rps.mean);
        this.addMetric('rps.count', report.count);
      }

      this.putMetric();
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

  addMetric(name, value) {

    // ignore undefined values
    if (value === undefined) {
      return;
    }
    debug({name, value, pid: process.pid, isMaster: require('cluster').isMaster}, 'addMetric');

    this.metrics.push({
      MetricName: name,
      Unit: "None",
      Value: isNaN(value) ? 0 : value,
      Dimensions: [
        {
          Name: 'Name',
          Value: this.options.name
        }
      ],
    });
  }

  putMetric() {

    const metrics = this.metrics;
    this.metrics = [];

    debug(metrics,'putMetric')

    const promise = this.cw.send(new PutMetricDataCommand({
      MetricData: metrics,
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
