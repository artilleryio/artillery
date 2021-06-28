'use strict';

const test = require('tape');
const sinon = require('sinon');

const fs = require('fs');
const os = require('os');

const util = require('../../lib/util');

let sandbox;
test('util - setup', (t) => {
  sandbox = sinon.sandbox.create();

  t.end();
})

test('formatting durations', function(t) {
  t.equal(
    util.formatDuration(1000),
    '1 second',
    'Durations with one second are formatted'
  );

  t.equal(
    util.formatDuration(30000),
    '30 seconds',
    'Durations with seconds are formatted'
  );

  t.equal(
    util.formatDuration(90000),
    '1 minute, 30 seconds',
    'Durations with one minute are formatted'
  );

  t.equal(
    util.formatDuration(150000),
    '2 minutes, 30 seconds',
    'Durations with minutes are formatted'
  );

  t.equal(
    util.formatDuration(4530000),
    '1 hour, 15 minutes, 30 seconds',
    'Durations with one hour are formatted'
  );

  t.equal(
    util.formatDuration(8130000),
    '2 hours, 15 minutes, 30 seconds',
    'Durations with hours are formatted'
  );

  t.equal(
    util.formatDuration(108030000),
    '1 day, 6 hours, 0 minutes, 30 seconds',
    'Durations with one day are formatted'
  );

  t.equal(
    util.formatDuration(194430000),
    '2 days, 6 hours, 0 minutes, 30 seconds',
    'Durations with days are formatted'
  );

  t.end();
});

test('readArtilleryConfig', function(t) {
  const readFileSyncStub = sandbox.stub(fs, 'readFileSync')
    .withArgs(`${os.homedir()}/.artilleryrc`)

  readFileSyncStub.throws();
  t.deepEqual(util.readArtilleryConfig(), {}, 'Returns an empty object if .artilleryrc is not present');

  const expectedConf = { property: 'value' };

  readFileSyncStub.returns(JSON.stringify(expectedConf))
  t.deepEqual(util.readArtilleryConfig(), expectedConf, 'Returns the configuration as a JSON object');

  t.end();
});

test('updateArtilleryConfig', function(t) {
  const existingConf = {
    property: 'value'
  };
  const addedConf = { newProperty: 'value2' };
  const fsWriteFileSyncStub = sandbox.stub(fs, 'writeFileSync');

  sandbox.stub(util, 'readArtilleryConfig').returns(existingConf);

  util.updateArtilleryConfig(addedConf);

  const newConfiguration = fsWriteFileSyncStub.args[0][1];
  const configPath = fsWriteFileSyncStub.args[0][0];

  t.deepEqual(newConfiguration, JSON.stringify({
    ...existingConf,
    ...addedConf
  }), 'Updates the existing configuration');

  t.equal(configPath, `${os.homedir()}/.artilleryrc`)

  t.end();
})

test('util - tear down', (t) => {
  sandbox.restore();

  t.end();
})
