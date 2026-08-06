/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Built-in plugins/engines ship inside the artillery package under
// dist/builtin-packages (see scripts/copy-builtin-packages.mjs). In the
// monorepo, bare specifiers resolve through workspace symlinks, so the
// bundled copies are only exercised in published installs - these tests
// force resolution through dist/builtin-packages to cover that path.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { BUILTIN_PACKAGE_NAMES } = require('../../lib/builtin-packages.ts');
const { loadPlugin } = require('../../lib/load-plugins.ts');

const builtinDir = path.join(
  __dirname,
  '..',
  '..',
  'dist',
  'builtin-packages'
);

test('every built-in package is bundled into dist/builtin-packages', () => {
  for (const name of BUILTIN_PACKAGE_NAMES) {
    const pkgJson = path.join(builtinDir, name, 'package.json');
    assert.ok(fs.existsSync(pkgJson), `${name} is bundled`);
    const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
    const entry = path.join(builtinDir, name, pkg.main || 'index.js');
    assert.ok(fs.existsSync(entry), `${name} entry point exists`);
  }
});

for (const name of BUILTIN_PACKAGE_NAMES.filter((n) =>
  n.startsWith('artillery-plugin-')
)) {
  const shortName = name.replace('artillery-plugin-', '');
  test(`bundled plugin loads from dist/builtin-packages: ${shortName}`, async () => {
    // Only the bundled dir in requirePaths - no bare-specifier fallback
    const result = await loadPlugin(shortName, {}, [builtinDir], {
      config: {}
    });
    assert.strictEqual(result.isLoaded, true, result.msg);
  });
}

test('bundled playwright engine loads from dist/builtin-packages', async () => {
  // Mirrors the fallback in @artilleryio/int-core's loadEngines
  const enginePath = require.resolve(
    path.join(builtinDir, 'artillery-engine-playwright')
  );
  const ns = await import(pathToFileURL(enginePath).href);
  const Engine = ns.default ?? ns;
  assert.strictEqual(typeof Engine, 'function', 'engine exports a class');
});
