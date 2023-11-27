'use strict';

const debug = require('debug')('plugin:distributed-tracing');
const crypto = require('crypto');
const {
  attachScenarioHooks
} = require('../artillery-plugin-publish-metrics/lib/util');

class DistributedTracingPlugin {
  constructor(script, events) {
    this.script = script;
    this.events = events;
    this.config = Object.assign(
      {
        tracePerRequest: false
      },
      script.config.plugins?.['distributed-tracing'] || {}
    );

    this.version = '00';
    this.traceFlags = '01';

    attachScenarioHooks(script, [
      {
        type: 'beforeRequest',
        name: 'setTraceparentHeader',
        hook: this.setTraceparentHeader.bind(this)
      }
    ]);
  }

  setTraceparentHeader(req, context, ee, next) {
    // If tracePerRequest setting is set to true, different traceId is set for each request
    if (this.config.tracePerRequest) {
      req.headers = {
        traceparent: this.generateTraceparent(this.generateTraceId())
      };
    }
    // Check if a traceId is already set for the scenario
    if (!context.vars.traceId) {
      context.vars.traceId = this.generateTraceId();
    }

    // Set the traceparent header
    req.headers = {
      traceparent: this.generateTraceparent(context.vars.traceId)
    };
    debug(
      `Set the 'traceparent' header with the following value: ${req.headers.traceparent}`
    );
    return next();
  }
  generateTraceparent(traceId) {
    const parentId = this.generateRandomHex(16);
    return `${this.version}-${traceId}-${parentId}-${this.traceFlags}`;
  }

  generateTraceId() {
    const artilleryId = 'a9'; // 2 hexadecimal digits as Artillery-specific identifier
    return artilleryId + this.generateRandomHex(30);
  }

  generateRandomHex(length) {
    return crypto
      .randomBytes(Math.ceil(length / 2))
      .toString('hex')
      .slice(0, length);
  }
  cleanup(done) {
    debug('Cleaning up');
    done(null);
  }
}

module.exports.Plugin = DistributedTracingPlugin;
