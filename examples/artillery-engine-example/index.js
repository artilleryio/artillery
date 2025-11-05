/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const A = require('async');
const debug = require('debug')('engine:example');

// Simple example engine that recieves a prop and prints it when a 'doSomething'
// action is found.
// Serves as a modifiable example to build on top of for new engines
class ExampleEngine {
  // Artillery initializes each engine with the following arguments:
  //
  // - script is the entire script object, with .config and .scenarios properties
  // - events is an EventEmitter we can use to subscribe to events from Artillery, and
  //   to report custom metrics
  // - helpers is a collection of utility functions
  constructor(script, ee, helpers) {
    this.script = script;
    this.ee = ee;
    this.helpers = helpers;

    // This would typically be the endpoint we're testing
    this.target = script.config.target;

    const opts = { ...this.script.config.example };

    // We can add custom validations on those props
    if (!opts.mandatoryString) {
      throw new Error('mandatoryString setting must be set');
    }
  }

  // For each scenario in the script using this engine, Artillery calls this function
  // to create a VU function
  createScenario(scenarioSpec, ee) {
    const tasks = scenarioSpec.flow.map((rs) => this.step(rs, ee));

    return function scenario(initialContext, callback) {
      ee.emit('started');

      function vuInit(callback) {
        // we can run custom VU-specific init code here
        return callback(null, initialContext);
      }

      const steps = [vuInit].concat(tasks);

      A.waterfall(steps, function done(err, context) {
        if (err) {
          debug(err);
        }

        return callback(err, context);
      });
    };
  }

  // This is a convenience function where we delegate common actions like loop, log, and think,
  // and handle actions which are custom for our engine, i.e. the "doSomething" action in this case
  step(rs, ee) {
    const self = this;

    if (rs.loop) {
      const steps = rs.loop.map((loopStep) => this.step(loopStep, ee));

      return this.helpers.createLoopWithCount(rs.count || -1, steps, {});
    }

    if (rs.log) {
      return function log(context, callback) {
        return process.nextTick(() => {
          callback(null, context);
        });
      };
    }

    if (rs.think) {
      return this.helpers.createThink(rs, self.config?.defaults?.think || {});
    }

    if (rs.function) {
      return (context, callback) => {
        const func = self.script.config.processor[rs.function];
        if (!func) {
          return process.nextTick(() => {
            callback(null, context);
          });
        }

        return func(context, ee, () => callback(null, context));
      };
    }

    //
    // This is our custom action:
    //
    if (rs.doSomething) {
      return function example(context, callback) {
        console.log(
          'doSomething action with id:',
          self.helpers.template(rs.doSomething.id, context, true)
        );
        console.log('target is:', self.target);

        // Emit a metric to count the number of example actions performed:
        ee.emit('counter', 'example.action_count', 1);
        return callback(null, context);
      };
    }

    //
    // Ignore any unrecognized actions:
    //
    return function doNothing(context, callback) {
      return callback(null, context);
    };
  }
}

module.exports = ExampleEngine;
