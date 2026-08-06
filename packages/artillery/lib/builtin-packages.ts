/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

// Built-in plugin & engine packages. They live as private workspace
// packages in the monorepo and are bundled into the published artillery
// package under dist/builtin-packages (see
// scripts/copy-builtin-packages.mjs). Their runtime dependencies are
// declared in artillery's own package.json - the copy script enforces
// this invariant at build time.
export const BUILTIN_PACKAGE_NAMES = [
  'artillery-engine-playwright',
  'artillery-plugin-apdex',
  'artillery-plugin-ensure',
  'artillery-plugin-expect',
  'artillery-plugin-fake-data',
  'artillery-plugin-metrics-by-endpoint',
  'artillery-plugin-publish-metrics',
  'artillery-plugin-slack'
];

// Compiled location of this file is dist/lib/builtin-packages.js, so the
// bundled packages sit one level up in dist/builtin-packages.
export const BUILTIN_PACKAGES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'builtin-packages'
);

// Resolution order: bare specifier first (a user-installed copy wins, and
// monorepo workspace symlinks resolve in dev), bundled copy second.
export function resolveBuiltinPackage(name: string): string {
  try {
    return require.resolve(name);
  } catch (bareErr) {
    try {
      return require.resolve(path.join(BUILTIN_PACKAGES_DIR, name));
    } catch (_builtinErr) {
      throw bareErr;
    }
  }
}

// Resolve with CJS semantics, load with import() - handles both CJS and
// ESM packages. CJS: default === module.exports; ESM: named exports via
// the namespace.
export async function loadBuiltinPackage(name: string) {
  const ns = await import(pathToFileURL(resolveBuiltinPackage(name)).href);
  return ns.default ?? ns;
}
