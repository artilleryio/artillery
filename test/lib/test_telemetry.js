'use strict';

const test = require('tape');
const rewiremock = require('rewiremock/node');
const telemetry = require('../../lib/telemetry');
const { version: artilleryVersion } = require('../../package.json');
const isCi = require('is-ci');
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

  PostHogMock.prototype.capture = captureSpy;
  PostHogMock.prototype.shutdown = shutdownSpy;

  rewiremock('posthog-node').with(PostHogMock);

  t.end();
});

test('Telemetry', function(t) {
  captureSpy.resetHistory();

  const telemetryClient = telemetry.init();

  telemetryClient.capture('test event');

  const callArg = captureSpy.args[0][0];

  t.deepEquals(
    callArg,
    {
      event: 'test event',
      distinctId: 'artillery-core',
      properties: {
        version: artilleryVersion,
        os: process.platform,
        isCi,
        $ip: null,
      },
    },
    'Sends telemetry data'
  );

  t.end();
});

test('Telemetry - disable through environment variable', function(t) {
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

test('Telemetry - debug through environment variable', function(t) {
  captureSpy.resetHistory();

  const consoleSpy = sandbox.spy(console, 'log');

  const eventPayload = {
    event: 'test event',
    distinctId: 'artillery-core',
    properties: {
      version: artilleryVersion,
      os: process.platform,
      isCi,
      $ip: null,
    },
  };
  const expectedDebugOutput = '\x1b[33mTelemetry data: {"event":"test event","distinctId":"artillery-core","properties":{"version":"2.0.0-dev3","os":"linux","isCi":false,"$ip":null}}\x1b[39m'

  process.env.ARTILLERY_TELEMETRY_DEBUG = 'true';

  const telemetryClient = telemetry.init();

  telemetryClient.capture('test event');

  const logArg = consoleSpy.args[0][0];

  t.false(
    captureSpy.called,
    'Does not send telemetry data if ARTILLERY_TELEMETRY_DEBUG environment variable is set to "true"'
  );

  t.equal(logArg, expectedDebugOutput, 'Logs telemetry data');

  delete process.env.ARTILLERY_TELEMETRY_DEBUG;
  t.end();
});

test('Telemetry - teardown', (t) => {
  sandbox.restore();
  rewiremock.disable();

  t.end();
});
