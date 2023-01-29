/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const debug = require('debug')('engine:posthog');
const A = require('async');
const _ = require('lodash');
const { PostHog } = require('posthog-node');
let client;

class PosthogEngine {
  constructor(script, ee, helpers) {
    this.script = script;
    this.ee = ee;
    this.helpers = helpers;

    return this;
  }

  async cleanup() {
    debug("Shutting down");
    await client.shutdownAsync();
  }

  customHandler(rs, ee) {
    const self = this;
    if (rs.capture) {
      return function capture(context, callback) {
        const params = {
          distinctId: self.helpers.template(rs.capture.distinctId, context, true),
          event: self.helpers.template(rs.capture.event, context, true),
          properties: self.helpers.template(rs.capture.properties, context, true)
        };
        debug(params);
        ee.emit('request');
        client.capture(params);
        ee.emit('response', 0, 0, context._uid);
        return callback(null, context);
      };
    }
    if (rs.identify) {
      return function identify(context, callback) {
        const params = {
          distinctId: self.helpers.template(rs.identify.distinctId, context, true),
          properties: self.helpers.template(rs.identify.properties, context, true)
        };
        debug(params);
        ee.emit('request');
        client.identify(params);
        ee.emit('response', 0, 0, context._uid);
        return callback(null, context);
      };
    }

    if (rs.alias) {
      return function alias(context, callback) {
        const params = {
          distinctId: self.helpers.template(rs.alias.distinctId, context, true),
          alias: self.helpers.template(rs.alias.alias, context, true)
        };
        debug(params);
        ee.emit('request');
        client.alias(params);
        ee.emit('response', 0, 0, context._uid);
        return callback(null, context);
      };
    }
  }

  customSetup(initialContext) {
    let opts = { ...this.script.config.posthog };

    if (!opts.apiKey) {
      throw new Error("no PostHog API key provided");
    }

    if (!opts.instance_address) {
      console.log(`WARNING: no PostHog instance provided. Defaulting to PostHog cloud`);
    }

    client = new PostHog(opts.api_key, {
    client = new PostHog(opts.apiKey, {
      flushInterval: 100
    });
  }

  createScenario(scenarioSpec, ee) {
    const tasks = scenarioSpec.flow.map(rs => this.step(rs, ee));

    return this.compile(tasks, scenarioSpec.flow, ee);
  }
  step(rs, ee) {
    const self = this;

    if (rs.loop) {
      const steps = rs.loop.map(loopStep => this.step(loopStep, ee));

      return this.helpers.createLoopWithCount(rs.count || -1, steps, {});
    }

    if (rs.log) {
      return function log(context, callback) {
        return process.nextTick(function () { callback(null, context); });
      };
    }

    if (rs.think) {
      return this.helpers.createThink(rs, _.get(self.config, 'defaults.think', {}));
    }

    if (rs.function) {
      return function (context, callback) {
        let func = self.script.config.processor[rs.function];
        if (!func) {
          return process.nextTick(function () { callback(null, context); });
        }

        return func(context, ee, function () {
          return callback(null, context);
        });
      };
    }

    const customResult = this.customHandler(rs, ee);
    if (customResult !== undefined) {
      return customResult;
    } else {
      return function (context, callback) {
        return callback(null, context);
      };
    }
  }
  compile(tasks, scenarioSpec, ee) {
    const self = this;
    return function scenario(initialContext, callback) {
      const init = function init(next) {
        self.customSetup(self, initialContext);
        ee.emit('started');
        return next(null, initialContext);
      };

      let steps = [init].concat(tasks);

      A.waterfall(
        steps,
        function done(err, context) {
          if (err) {
            debug(err);
          }

          return callback(err, context);
        });
    };
  }
}
module.exports = PosthogEngine;

