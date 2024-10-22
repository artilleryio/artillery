/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const debug = require('debug')('engine:posthog');
const A = require('async');
const { PostHog } = require('posthog-node');
const { callbackify } = require('node:util');
class PosthogEngine {
  constructor(script, ee, helpers) {
    this.script = script;
    this.ee = ee;
    this.helpers = helpers;
    this.target = script.config.target;

    this.apiKey = this.script.config?.posthog?.apiKey;

    if (!this.apiKey) {
      throw new Error('no PostHog API key provided');
    }

    return this;
  }

  customHandler(rs, ee) {
    const self = this;
    if (rs.capture) {
      return function capture(context, callback) {
        const params = {
          distinctId: self.helpers.template(
            rs.capture.distinctId,
            context,
            true
          ),
          event: self.helpers.template(rs.capture.event, context, true),
          properties: self.helpers.template(
            rs.capture.properties,
            context,
            true
          )
        };
        debug(params);
        context.postHogClient.capture(params);
        ee.emit('counter', 'engine.posthog.capture', 1);
        ee.emit('rate', 'engine.posthog.capture_rate');
        return callback(null, context);
      };
    }
    if (rs.identify) {
      return function identify(context, callback) {
        const params = {
          distinctId: self.helpers.template(
            rs.identify.distinctId,
            context,
            true
          ),
          properties: self.helpers.template(
            rs.identify.properties,
            context,
            true
          )
        };
        debug(params);
        context.postHogClient.identify(params);
        ee.emit('counter', 'engine.posthog.identify', 1);
        ee.emit('rate', 'engine.posthog.identify_rate');
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
        context.postHogClient.alias(params);
        ee.emit('counter', 'engine.posthog.alias', 1);
        ee.emit('rate', 'engine.posthog.alias_rate');
        return callback(null, context);
      };
    }
  }

  createScenario(scenarioSpec, ee) {
    const tasks = scenarioSpec.flow.map((rs) => this.step(rs, ee));

    return this.compile(tasks, scenarioSpec.flow, ee);
  }
  step(rs, ee) {
    const self = this;

    if (rs.loop) {
      const steps = rs.loop.map((loopStep) => this.step(loopStep, ee));

      return this.helpers.createLoopWithCount(rs.count || -1, steps, {});
    }

    if (rs.log) {
      return function log(context, callback) {
        console.log(self.helpers.template(rs.log, context));
        return process.nextTick(function () {
          callback(null, context);
        });
      };
    }

    if (rs.think) {
      return this.helpers.createThink(
        rs,
        self.script.config.defaults?.think || {}
      );
    }

    if (rs.function) {
      return function (context, callback) {
        let func = self.script.config.processor[rs.function];
        if (!func) {
          return process.nextTick(function () {
            callback(null, context);
          });
        }

        return func(context, ee, function (hookErr) {
          return callback(hookErr, context);
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
        initialContext.postHogClient = new PostHog(self.apiKey, {
          flushInterval: 100,
          host: self.target
        });

        ee.emit('started');
        return next(null, initialContext);
      };

      let steps = [init].concat(tasks);

      A.waterfall(steps, function done(err, context) {
        if (err) {
          debug(err);
        }

        if (context.postHogClient) {
          callbackify(context.postHogClient.shutdown)((postHogErr) => {
            // Ignore PostHog error as there's nothing we can do anyway
            debug(postHogErr);
            return callback(err, context);
          });
        }
      });
    };
  }
}
module.exports = PosthogEngine;
