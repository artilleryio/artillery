

const { test } = require('node:test');
const assert = require('node:assert');
const sinon = require('sinon');

const fs = require('node:fs');
const os = require('node:os');

const util = require('../../lib/util.ts');
const utilConfig = require('../../lib/utils-config.ts');

let sandbox;
test('util - setup', (_t, done) => {
  sandbox = sinon.sandbox.create();

  done();
});

test('formatting durations', (_t, done) => {
  assert.strictEqual(util.formatDuration(1000), '1 second', 'Durations with one second are formatted');

  assert.strictEqual(util.formatDuration(30000), '30 seconds', 'Durations with seconds are formatted');

  assert.strictEqual(util.formatDuration(90000), '1 minute, 30 seconds', 'Durations with one minute are formatted');

  assert.strictEqual(util.formatDuration(150000), '2 minutes, 30 seconds', 'Durations with minutes are formatted');

  assert.strictEqual(util.formatDuration(4530000), '1 hour, 15 minutes, 30 seconds', 'Durations with one hour are formatted');

  assert.strictEqual(util.formatDuration(8130000), '2 hours, 15 minutes, 30 seconds', 'Durations with hours are formatted');

  assert.strictEqual(util.formatDuration(108030000), '1 day, 6 hours, 0 minutes, 30 seconds', 'Durations with one day are formatted');

  assert.strictEqual(util.formatDuration(194430000), '2 days, 6 hours, 0 minutes, 30 seconds', 'Durations with days are formatted');

  done();
});

test('readArtilleryConfig', (_t, done) => {
  const readFileSyncStub = sandbox
    .stub(fs, 'readFileSync')
    .withArgs(`${os.homedir()}/.artilleryrc`);

  readFileSyncStub.throws();
  assert.deepEqual(utilConfig.readArtilleryConfig(), {}, 'Returns an empty object if .artilleryrc is not present');

  const expectedConf = { property: 'value' };

  readFileSyncStub.returns(JSON.stringify(expectedConf));
  assert.deepEqual(utilConfig.readArtilleryConfig(), expectedConf, 'Returns the configuration as a JSON object');

  done();
});

test('updateArtilleryConfig', (_t, done) => {
  const existingConf = {
    property: 'value'
  };
  const addedConf = { newProperty: 'value2' };
  const fsWriteFileSyncStub = sandbox.stub(fs, 'writeFileSync');

  // NOTE: readArtilleryConfig is NOT stubbed here - sinon cannot stub ES
  // module namespaces, and the old stub never affected the internal call
  // anyway (it references the local binding). The fs.readFileSync stub
  // from the previous test (shared sandbox, restored only in teardown)
  // makes readArtilleryConfig return existingConf.
  utilConfig.updateArtilleryConfig(addedConf);

  const newConfiguration = fsWriteFileSyncStub.args[0][1];
  const configPath = fsWriteFileSyncStub.args[0][0];

  assert.deepEqual(newConfiguration, JSON.stringify({
      ...existingConf,
      ...addedConf
    }), 'Updates the existing configuration');

  assert.strictEqual(configPath, `${os.homedir()}/.artilleryrc`);

  done();
});

test('padded', (_t, done) => {
  assert.strictEqual(util.padded('name', 'result', 10, (x) => x), 'name ...... result', 'pads the space between the name and the result according to the length');

  assert.strictEqual(util.padded('longer name', 'result', 9, (x) => x), 'longer...  result', 'truncates the name when longer than the allowed length');

  assert.strictEqual(util.padded('exact length', 'result', 12, (x) => x), 'exact length  result', 'no truncating when the string length exactly matches the allowed length');

  done();
});

test('util - tear down', (_t, done) => {
  sandbox.restore();

  done();
});
