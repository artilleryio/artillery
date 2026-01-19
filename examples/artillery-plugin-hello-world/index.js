/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const debug = require('debug')('plugin:hello-world');

module.exports.Plugin = ArtilleryHelloWorldPlugin;

function ArtilleryHelloWorldPlugin(script, events) {
  // This is the entirety of the test script - config and
  // scenarios
  this.script = script;
  // This is an EventEmitter, we can subscribe to:
  // 'stats' - fired when a new batch of metrics is available
  // 'done' - fired when all VUs are done
  // We can also use this EventEmitter to emit custom
  // metrics:
  // https://artillery.io/docs/guides/guides/extending.html#Tracking-custom-metrics
  this.events = events;

  // We can read our plugin's configuration:
  const pluginConfig = script.config.plugins['hello-world'];
  this.greeting = pluginConfig.greeting || 'hello, world';

  // But we could also read anything else defined in the test
  // script, e.g.:
  debug('target is:', script.config.target);

  //
  // Let's attach a beforeRequest hook to all scenarios
  // which will print a greeting before a request is made
  //
  // Create processor object if needed to hold our custom function:
  script.config.processor = script.config.processor || {};
  // Add our custom function:
  script.config.processor.pluginHelloWorldBeforeRequestHook = (
    _req,
    _vuContext,
    events,
    next
  ) => {
    // This a beforeRequest handler function:
    // https://artillery.io/docs/guides/guides/http-reference.html#beforeRequest

    console.log(this.greeting); // print greeting
    events.emit('counter', 'greeting_count', 1); // increase custom counter
    return next(); // the hook is done, go on to the next one (or let Artillery make the request)
  };
  // Attach the function to every scenario as a scenario-level hook:
  script.scenarios.forEach((scenario) => {
    scenario.beforeRequest = scenario.beforeRequest || [];
    scenario.beforeRequest.push('pluginHelloWorldBeforeRequestHook');
  });

  return this;
}

// Artillery will call this before it exits to give plugins
// a chance to clean up, e.g. by flushing any in-flight data,
// writing something to disk etc.
ArtilleryHelloWorldPlugin.prototype.cleanup = (done) => {
  debug('cleaning up');
  done(null);
};
