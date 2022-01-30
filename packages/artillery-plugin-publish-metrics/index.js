/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const NS = 'plugin:publish-metrics';
const debug = require('debug')(NS);
const A = require('async');

const { createDatadogReporter } = require('./lib/datadog');
const { createHoneycombReporter } = require('./lib/honeycomb');
const { createLightstepReporter } = require('./lib/lightstep');
const { createMixPanelReporter } = require('./lib/mixpanel');
const { createPrometheusReporter } = require("./lib/prometheus");

module.exports = {
  Plugin,
  LEGACY_METRICS_FORMAT: false,
};

function Plugin(script, events) {
  this.script = script;
  this.events = events;

  this.reporters = [];
  (script.config.plugins['publish-metrics'] || []).forEach((config) => {
    if (
      config.type === 'datadog' ||
      config.type === 'statsd' ||
      config.type === 'influxdb-statsd'
    ) {
      this.reporters.push(createDatadogReporter(config, events, script));
    } else if (config.type === 'honeycomb') {
      this.reporters.push(createHoneycombReporter(config, events, script));
    } else if (config.type === 'lightstep') {
      this.reporters.push(createLightstepReporter(config, events, script));
    } else if (config.type === 'mixpanel') {
      this.reporters.push(createMixPanelReporter(config, events, script));
    } else if (config.type === 'prometheus') {
      this.reporters.push(createPrometheusReporter(config, events, script));
    } else {
      events.emit(
        'userWarning',
        `Reporting type "${config.type}" is not recognized.`,
        {
          type: 'plugin',
          id: NS,
        }
      );
    }
  });
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
