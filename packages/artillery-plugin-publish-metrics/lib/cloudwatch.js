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
    debug({config, events, script}, 'CloudWatchReporter');
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

      this.promises.push( this.putMetric('scenarios.created', report.scenariosCreated) );
      this.promises.push( this.putMetric('scenarios.completed', report.scenariosCompleted) );
      this.promises.push( this.putMetric('requests.completed', report.requestsCompleted) );

      if (report.latency) {
        this.promises.push( this.putMetric('latency.min', report.latency.min) );
        this.promises.push( this.putMetric('latency.max', report.latency.max) );
        this.promises.push( this.putMetric('latency.median', report.latency.median) );
        this.promises.push( this.putMetric('latency.p95', report.latency.p95) );
        this.promises.push( this.putMetric('latency.p99', report.latency.p99) );
      }

      if (report.customStats) {
        Object.entries(report.customStats).forEach(([groupName, group]) => {
          Object.entries(group).forEach(([statName, value]) => {
            const key = `custom.${groupName}.${statName}`;
            this.promises.push( this.putMetric(key, value) );
          })
        });
      }

      if (report.counters) {
        Object.entries(report.counters).forEach(([name, value]) => {
          const key = `counters.${name}`;
          this.promises.push( this.putMetric(key, value) );
        })
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

  async putMetric(name, value) {
    debug({name, value}, 'putMetric');

    const result = await this.cw.send(new PutMetricDataCommand({
      MetricData: [
        {
          MetricName: name,
          Unit: "None",
          Value: value,
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
  }

}

function createCloudWatchReporter(config, events, script) {
  return new CloudWatchReporter(config, events, script);
}

module.exports = {
  createCloudWatchReporter
};
