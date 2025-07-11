/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const NS = 'plugin:publish-metrics';
const debug = require('debug')(NS);
const A = require('async');

const {
  getADOTRelevantReporterConfigs,
  resolveADOTConfigSettings
} = require('./lib/open-telemetry/translators/vendor-adot');

// List of reporters that use OpenTelemetry
const REPORTERS_USING_OTEL = [
  'open-telemetry',
  'honeycomb',
  'newrelic',
  'datadog',
  'dynatrace',
  'cloudwatch'
];
module.exports = {
  Plugin,
  LEGACY_METRICS_FORMAT: false,
  getADOTRelevantReporterConfigs,
  resolveADOTConfigSettings
};

function Plugin(script, events) {
  this.script = script;
  this.events = events;
  this.pluginConfig = script.config.plugins['publish-metrics'] || [];

  this.reporters = [];
  this.configsOfReportersUsingOTel = [];

  this.pluginConfig.forEach((config) => {
    if (REPORTERS_USING_OTEL.includes(config.type)) {
      this.configsOfReportersUsingOTel.push(config);
    }
    if (
      config.type === 'datadog' ||
      config.type === 'statsd' ||
      config.type === 'influxdb-statsd'
    ) {
      const { createDatadogReporter } = require('./lib/datadog');
      this.reporters.push(createDatadogReporter(config, events, script));
    } else if (config.type === 'splunk') {
      const { createSplunkReporter } = require('./lib/splunk');
      this.reporters.push(createSplunkReporter(config, events, script));
    } else if (config.type === 'mixpanel') {
      const { createMixPanelReporter } = require('./lib/mixpanel');
      this.reporters.push(createMixPanelReporter(config, events, script));
    } else if (config.type === 'prometheus') {
      const { createPrometheusReporter } = require('./lib/prometheus');
      this.reporters.push(createPrometheusReporter(config, events, script));
    } else if (config.type === 'cloudwatch') {
      const { createCloudWatchReporter } = require('./lib/cloudwatch');
      this.reporters.push(createCloudWatchReporter(config, events, script));
    } else if (config.type === 'newrelic') {
      const { createNewRelicReporter } = require('./lib/newrelic');
      this.reporters.push(createNewRelicReporter(config, events, script));
    } else if (config.type === 'dynatrace') {
      const { createDynatraceReporter } = require('./lib/dynatrace');
      this.reporters.push(createDynatraceReporter(config, events, script));
    } else if (config.type === 'open-telemetry') {
    } else {
      events.emit(
        'userWarning',
        `Reporting type "${config.type}" is not recognized.`,
        {
          type: 'plugin',
          id: NS
        }
      );
    }
  });
  if (this.configsOfReportersUsingOTel.length > 0) {
    const { createOTelReporter } = require('./lib/open-telemetry');
    this.reporters.push(
      createOTelReporter(this.configsOfReportersUsingOTel, events, script)
    );
  }

  return this;
}

Plugin.prototype.cleanup = function (done) {
  A.eachSeries(
    this.reporters,
    (reporter, next) => {
      reporter.cleanup(() => {
        next();
      });
    },
    () => {
      return done();
    }
  );
};
