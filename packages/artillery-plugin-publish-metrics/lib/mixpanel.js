const Mixpanel = require('mixpanel');
const { versionCheck } = require('./util');
const debug = require('debug')('plugin:publish-metrics:mixpanel');

class MixPanelReporter {
  constructor(config, events, script) {
    if (!config.projectToken) {
      throw new Error(
        'Mixpanel reporter: projectToken must be provided. More info in the docs (https://docs.art/reference/extensions/publish-metrics#mixpanel)'
      );
    }
    this.mixPanelOpts = {
      projectToken: config.projectToken
    };

    if (!versionCheck('>=1.7.0')) {
      console.error(
        `[publish-metrics][mixpanel] Mixpanel support requires Artillery >= v1.7.0 (current version: ${
          global.artillery ? global.artillery.version || 'unknown' : 'unknown'
        })`
      );
    }

    this.mixpanel = Mixpanel.init(this.mixPanelOpts.projectToken);
    this.sendToMixPanel(config, events, script);
    debug('init done');
  }

  sendToMixPanel(config, events, script) {
    events.on('stats', (stats) => {
      const report = this.formatProperties(stats);
      let env = script._environment
        ? script._environment.toUpperCase()
        : script.config.target;

      this.mixpanel.track(
        `${env}-${script.scenarios[0]['name'] || 'Artillery.io'}`,
        report
      );
    });
  }

  formatProperties(stats) {
    const properties = {};

    for (const [name, value] of Object.entries(stats)) {
      if (name === 'histograms') {
        continue;
      }
      if (typeof value !== 'object') {
        properties[name] = value;
      }
    }

    for (const [name, value] of Object.entries(
      { ...stats.counters, ...stats.rates } || {}
    )) {
      properties[name] = value;
    }

    for (const [name, values] of Object.entries(stats.summaries || {})) {
      for (const [aggregation, value] of Object.entries(values)) {
        properties[`${name}.${aggregation}`] = value;
      }
    }

    return properties;
  }

  cleanup(done) {
    debug('cleaning up');
    return done();
  }
}

function createMixPanelReporter(config, events, script) {
  return new MixPanelReporter(config, events, script);
}

module.exports = {
  createMixPanelReporter
};
