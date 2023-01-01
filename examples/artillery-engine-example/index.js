/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const A = require('async');
const _ = require('lodash');

//This is important as it gives us debug granularity!
const debug = require('debug')('engine:example');

// Simple example engine that recieves a prop and prints it when an 'example'
// action is found.
// Serves as a modifiable example to build on top of for new engines
class ExampleEngine {
  constructor(script, ee, helpers) {
    this.script = script;
    this.ee = ee;
    this.helpers = helpers;

    return this;
  }

  // Runs on startup and it's used to setup our engine and it's dependencies
  customSetup(self, initialContext) {
    debug("executing setup logic");
    // Can use properties defined in the script we are running
    let opts = { ...self.script.config.example };

    // We can add custom validations on those props
    if (!opts.mandatoryString) {
      throw new Error("no Example engine opts found");
    }

    // setup initial context for our logic to work as desired
    initialContext.mandatoryString = opts.mandatoryString;

    // This is pretty basic but for example here we could set up
    // an external dependency we introduced via `npm install ..` and that
    // we are planning to use later on.
  }

  // Runs on every Artillery action
  customHandler(self, rs, ee) {
    // In this case we are only handling our simple `example` action
    if (rs.example) {
      return function example(context, callback) {
        const params = {
          id: self.helpers.template(rs.example.id, context, true),
        };
        debug(params);
        ee.emit('request');

        // Custom logic here!
        debug(`script prop: ${context.mandatoryString}`);
        debug(`scenario prop: ${params.id}`);

        ee.emit('response', 0, 0, context._uid);
        return callback(null, context);
      };
    }
  }

  // Boiler plate that handles other Artillery functionalities
  // Can be used as-is for most scripts but it's also modifiable!
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

    const customResult = this.customHandler(self, rs, ee);
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
module.exports = ExampleEngine;

