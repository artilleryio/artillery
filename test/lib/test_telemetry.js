'use strict';

const { test } = require('tap');
const rewiremock = require('rewiremock/node');
const telemetry = require('../../lib/telemetry');
const { version: artilleryVersion } = require('../../package.json');
const ci = require('ci-info');
const sinon = require('sinon');

let sandbox;
let captureSpy;
let shutdownSpy;

function PostHogMock() {}

test('Telemetry - setup', (t) => {
  sandbox = sinon.sandbox.create();
  rewiremock.enable();

  captureSpy = sandbox.spy();
  shutdownSpy = sandbox.spy();

  // make sure telemetry is enabled
  delete process.env.ARTILLERY_DISABLE_TELEMETRY;

  PostHogMock.prototype.capture = captureSpy;
  PostHogMock.prototype.shutdown = shutdownSpy;

  rewiremock('posthog-node').with(PostHogMock);

  t.end();
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
      $ip: null,
      source: 'test-suite'
    }
  };

  if (ci.isCI) {
    expectedEvent.properties.ciName = ci.name;
  }

  t.deepEquals(callArg, expectedEvent, 'Sends telemetry data');

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
      $ip: null,
      default1: 'value1',
      default2: 2
    }
  };

  if (ci.isCI) {
    expectedEvent.properties.ciName = ci.name;
  }

  t.deepEquals(callArg, expectedEvent, 'Sends telemetry data');

  delete process.env.ARTILLERY_TELEMETRY_DEFAULTS;

  t.end();
});

test('Telemetry - disable through environment variable', function (t) {
  captureSpy.resetHistory();

  process.env.ARTILLERY_DISABLE_TELEMETRY = 'true';

  const telemetryClient = telemetry.init();

  telemetryClient.capture('test event');

  t.false(
    captureSpy.called,
    'Does not send telemetry data if ARTILLERY_DISABLE_TELEMETRY environment variable is set to "true"'
  );

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

  t.ok(logArg, expectedDebugOutput, 'Logs telemetry data');

  delete process.env.ARTILLERY_TELEMETRY_DEBUG;
  t.end();
});

test('Telemetry - teardown', (t) => {
  sandbox.restore();
  rewiremock.disable();

  t.end();
});
