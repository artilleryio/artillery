/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */



const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { loadPlugin, loadPlugins } = require('../../lib/load-plugins');

const fixturesDir = path.join(__dirname, 'fixtures', 'plugins');
const requirePaths = ['', fixturesDir];
const testScript = { config: {} };

const MATRIX = [
  { name: 'cjsv1', version: 1, kind: 'cjs-v1' },
  { name: 'cjsv2', version: 2, kind: 'cjs-v2' },
  { name: 'esmnamed', version: 2, kind: 'esm-named' },
  { name: 'esmdefault', version: 1, kind: 'esm-default' },
  { name: 'esmtla', version: 2, kind: 'esm-tla' },
  { name: 'esmmixed', version: 2, kind: 'esm-mixed' }
];

for (const { name, version, kind } of MATRIX) {
  test(`loadPlugin - ${name}`, async (_t) => {
    const result = await loadPlugin(name, {}, requirePaths, testScript);

    assert.strictEqual(result.isLoaded, true, 'plugin is loaded');
    assert.strictEqual(result.version, version, `detected as v${version}`);

    const instance =
      version === 1
        ? new result.PluginExport({}, null)
        : new result.PluginExport.Plugin({}, null);
    assert.strictEqual(instance.kind, kind, 'plugin constructor works');
  });
}

test('loadPlugin - missing plugin reports MODULE_NOT_FOUND', async (_t) => {
  const result = await loadPlugin(
    'does-not-exist',
    {},
    requirePaths,
    testScript
  );

  assert.strictEqual(result.isLoaded, false, 'plugin is not loaded');
  assert.strictEqual(result.error.code, 'MODULE_NOT_FOUND', 'error code preserved');
  assert.match(result.msg, /could not be found/, 'warning message set');
});

test('loadPlugins - resolves via ARTILLERY_PLUGIN_PATH', async (t) => {
  const previous = process.env.ARTILLERY_PLUGIN_PATH;
  process.env.ARTILLERY_PLUGIN_PATH = fixturesDir;

  t.after(() => {
    if (previous === undefined) {
      delete process.env.ARTILLERY_PLUGIN_PATH;
    } else {
      process.env.ARTILLERY_PLUGIN_PATH = previous;
    }
  });

  const results = await loadPlugins(
    { cjsv2: {}, esmnamed: {} },
    testScript
  );

  assert.strictEqual(results.cjsv2.isLoaded, true, 'CJS plugin loaded via plugin path');
  assert.strictEqual(results.cjsv2.version, 2, 'CJS plugin detected as v2');
  assert.strictEqual(results.esmnamed.isLoaded, true, 'ESM plugin loaded via plugin path');
  assert.strictEqual(results.esmnamed.version, 2, 'ESM plugin detected as v2');
});
