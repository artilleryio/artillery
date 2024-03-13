'use strict';

const { test, afterEach, before, after } = require('tap');
const rewiremock = require('rewiremock/node');
const telemetry = require('../../lib/telemetry');
const { version: artilleryVersion } = require('../../package.json');
const ci = require('ci-info');
const sinon = require('sinon');

let sandbox;
let captureSpy;
let shutdownSpy;

class InnerPostHog {}
const PostHogMock = {
  PostHog: InnerPostHog
};

before(() => {
  sandbox = sinon.sandbox.create();
  rewiremock.enable();

  captureSpy = sandbox.spy();
  shutdownSpy = sandbox.spy();

  InnerPostHog.prototype.capture = captureSpy;
  InnerPostHog.prototype.shutdown = shutdownSpy;

  rewiremock('posthog-node').with(PostHogMock);
});

afterEach(() => {
  delete process.env.ARTILLERY_TELEMETRY_DEFAULTS;
  delete process.env.ARTILLERY_TELEMETRY_DEBUG;
});

after(() => {
  sandbox.restore();
  rewiremock.disable();
});

test('Telemetry', function (t) {
  captureSpy.resetHistory();

  const telemetryClient = telemetry.init();

  telemetryClient.capture('test event');

  const callArg = captureSpy.args[0][0];
  const expectedEvent = {
    event: 'test event',
    distinctId: 'artillery-core',
    properties: {
      version: artilleryVersion,
      os: process.platform,
      isCi: ci.isCI,
      $ip: 'not-collected',
      source: 'test-suite'
    }
  };

  if (ci.isCI) {
    expectedEvent.properties.ciName = ci.name;
  }

  t.same(callArg, expectedEvent, 'Sends telemetry data');

  t.end();
});

test('Telemetry with defaults env var', function (t) {
  captureSpy.resetHistory();

  process.env.ARTILLERY_TELEMETRY_DEFAULTS = JSON.stringify({
    default1: 'value1',
    default2: 2
  });

  const telemetryClient = telemetry.init();

  telemetryClient.capture('test event');

  const callArg = captureSpy.args[0][0];
  const expectedEvent = {
    event: 'test event',
    distinctId: 'artillery-core',
    properties: {
      version: artilleryVersion,
      os: process.platform,
      isCi: ci.isCI,
      $ip: 'not-collected',
      default1: 'value1',
      default2: 2
    }
  };

  if (ci.isCI) {
    expectedEvent.properties.ciName = ci.name;
  }

  t.same(callArg, expectedEvent, 'Sends telemetry data');

  delete process.env.ARTILLERY_TELEMETRY_DEFAULTS;

  t.end();
});

test('Telemetry - disable user info through environment variable', function (t) {
  captureSpy.resetHistory();

  process.env.ARTILLERY_DISABLE_TELEMETRY = 'true';

  const telemetryClient = telemetry.init();

  telemetryClient.capture('test event');
  const callArg = captureSpy.args[0][0];
  const expectedEvent = {
    event: 'test event',
    distinctId: 'artillery-core',
    properties: {
      $ip: 'not-collected'
    }
  };

  t.same(callArg, expectedEvent, 'Only basic ping is sent if user opted out');

  delete process.env.ARTILLERY_DISABLE_TELEMETRY;
  t.end();
});

test('Telemetry - debug through environment variable', function (t) {
  captureSpy.resetHistory();

  const consoleSpy = sandbox.spy(console, 'log');
  const expectedDebugOutput = `Telemetry data: {"event":"test event","distinctId":"artillery-core","properties":{"version":"${artilleryVersion}"`;

  process.env.ARTILLERY_TELEMETRY_DEBUG = 'true';

  const telemetryClient = telemetry.init();

  telemetryClient.capture('test event');

  const logArg = consoleSpy.args[0][0];

  t.equal(logArg, expectedDebugOutput, 'Logs telemetry data');

  t.end();
});
