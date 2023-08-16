/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * */

const lightstep = require('lightstep-tracer');
const opentracing = require('opentracing');

const { attachScenarioHooks, versionCheck } = require('./util');
const debug = require('debug')('plugin:publish-metrics:lightstep');

const { URL } = require('url');

class LightstepReporter {
  constructor(config, events, script) {
    if (!config.accessToken || !config.componentName) {
      throw new Error(
        'Lightstep reporter: accessToken and componentName must be provided. More info in the docs (https://docs.art/reference/extensions/publish-metrics#lightstep)'
      );
    }
    this.lightstepOpts = {
      accessToken: config.accessToken,
      componentName: config.componentName,
      disabled: config.enabled === false
    };

    this.defaultTags = {};
    if (typeof config.tags !== 'undefined') {
      if (Array.isArray(config.tags)) {
        (config.tags || []).forEach((s) => {
          this.defaultTags[s.split(':')[0]] = s.split(':')[1];
        });
      } else if (typeof config.tags === 'object') {
        this.defaultTags = config.tags;
      } else {
        // TODO: Warning
      }
    }

    if (!versionCheck('>=1.7.0')) {
      console.error(
        `[publish-metrics][lightstep] Lightstep support requires Artillery >= v1.7.0 (current version: ${
          global.artillery ? global.artillery.version || 'unknown' : 'unknown'
        })`
      );
    }

    // TODO: Validate options
    this.tracer = new lightstep.Tracer({
      component_name: this.lightstepOpts.componentName,
      access_token: this.lightstepOpts.accessToken
    });

    opentracing.initGlobalTracer(this.tracer);

    attachScenarioHooks(script, [
      {
        type: 'beforeRequest',
        name: 'startLightstepSpan',
        hook: this.startLightstepSpan.bind(this)
      }
    ]);

    attachScenarioHooks(script, [
      {
        type: 'afterResponse',
        name: 'sendToLightstep',
        hook: this.sendToLightstep.bind(this)
      }
    ]);

    debug('init done');
  }

  startLightstepSpan(req, userContext, events, done) {
    if (this.lightstepOpts.disabled) {
      return done();
    }

    const span = opentracing.globalTracer().startSpan('http_request');
    span.setTag('kind', 'client');
    span.log({ event: 'http_request_started' });
    userContext.vars['__lightstepSpan'] = span;
    return done();
  }

  sendToLightstep(req, res, userContext, events, done) {
    if (!userContext.vars['__lightstepSpan']) {
      return done();
    }

    const span = userContext.vars['__lightstepSpan'];
    span.log({ event: 'http_request_completed' });

    const url = new URL(req.url);
    span.setTag('url', url.href);
    span.setTag('host', url.host);
    span.setTag('method', req.method);
    span.setTag('statusCode', res.statusCode);

    for (const [name, value] of Object.entries(this.defaultTags)) {
      span.setTag(name, value);
    }

    if (res.timings && res.timings.phases) {
      span.setTag('responseTimeMs', res.timings.phases.firstByte);
    }

    debug('span finished', span.generateTraceURL());
    span.finish();
    return done();
  }

  cleanup(done) {
    debug('cleaning up');
    if (!this.lightstepOpts.disabled) {
      debug('lighstep flushed');
      this.tracer.flush();
    }
    return done();
  }
}

function createLightstepReporter(config, events, script) {
  return new LightstepReporter(config, events, script);
}

module.exports = {
  createLightstepReporter
};
