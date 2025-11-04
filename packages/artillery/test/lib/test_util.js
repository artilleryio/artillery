

const { test } = require('tap');
const sinon = require('sinon');

const fs = require('node:fs');
const os = require('node:os');

const util = require('../../lib/util');
const utilConfig = require('../../lib/utils-config');

let sandbox;
test('util - setup', (t) => {
  sandbox = sinon.sandbox.create();

  t.end();
});

test('formatting durations', (t) => {
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

test('readArtilleryConfig', (t) => {
  const readFileSyncStub = sandbox
    .stub(fs, 'readFileSync')
    .withArgs(`${os.homedir()}/.artilleryrc`);

  readFileSyncStub.throws();
  t.same(
    utilConfig.readArtilleryConfig(),
    {},
    'Returns an empty object if .artilleryrc is not present'
  );

  const expectedConf = { property: 'value' };

  readFileSyncStub.returns(JSON.stringify(expectedConf));
  t.same(
    utilConfig.readArtilleryConfig(),
    expectedConf,
    'Returns the configuration as a JSON object'
  );

  t.end();
});

test('updateArtilleryConfig', (t) => {
  const existingConf = {
    property: 'value'
  };
  const addedConf = { newProperty: 'value2' };
  const fsWriteFileSyncStub = sandbox.stub(fs, 'writeFileSync');

  sandbox.stub(utilConfig, 'readArtilleryConfig').returns(existingConf);

  utilConfig.updateArtilleryConfig(addedConf);

  const newConfiguration = fsWriteFileSyncStub.args[0][1];
  const configPath = fsWriteFileSyncStub.args[0][0];

  t.same(
    newConfiguration,
    JSON.stringify({
      ...existingConf,
      ...addedConf
    }),
    'Updates the existing configuration'
  );

  t.equal(configPath, `${os.homedir()}/.artilleryrc`);

  t.end();
});

test('padded', (t) => {
  t.equal(
    util.padded('name', 'result', 10, (x) => x),
    'name ...... result',
    'pads the space between the name and the result according to the length'
  );

  t.equal(
    util.padded('longer name', 'result', 9, (x) => x),
    'longer...  result',
    'truncates the name when longer than the allowed length'
  );

  t.equal(
    util.padded('exact length', 'result', 12, (x) => x),
    'exact length  result',
    'no truncating when the string length exactly matches the allowed length'
  );

  t.end();
});

test('util - tear down', (t) => {
  sandbox.restore();

  t.end();
});
