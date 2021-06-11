const Mixpanel = require('mixpanel');
const { versionCheck } = require('./util');
const debug = require('debug')('plugin:publish-metrics:mixpanel');

class MixPanelReporter {
  constructor(config, events, script) {
    this.mixPanelOpts = {
      projectToken: config.projectToken,
    };

    if (!versionCheck(">=1.7.0")) {
      console.error(
        `[publish-metrics][mixpanel] Mixpanel support requires Artillery >= v1.7.0 (current version: ${
          global.artillery ? global.artillery.version || 'unknown' : 'unknown'
        })`
      );
    }
    if (!this.mixPanelOpts.projectToken) {
      console.error(`mix panel project token not specified`);
    }
    this.mixpanel = Mixpanel.init(this.mixPanelOpts.projectToken);
    this.sendToMixPanel(config, events, script);
    debug('init done');
  }

  sendToMixPanel(config, events, script) {
    events.on('stats', (stats) => {
      const report = stats.report();
      let env = script._environment
        ? script._environment.toUpperCase()
        : script.config.target;

      this.mixpanel.track(`${env}-${script.scenarios[0].name}`, {
        ...report,
      });
    });
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
  createMixPanelReporter,
};
