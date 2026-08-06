/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Copies built-in plugin & engine packages into dist/builtin-packages so
// they ship inside the published artillery package (files includes /dist).
// Runs as part of "npm run build" for the artillery package, after tsc -
// the built-in packages must be built first (turbo dependsOn ^build, or
// the tsc loop in the worker image Dockerfile).
//
// Also enforces the dependency invariant: every runtime dependency of
// every built-in package must be declared in artillery's own package.json
// with an identical version range. Bundled copies resolve their deps by
// walking up to the consumer's node_modules, so a missing or mismatched
// range would silently load the wrong version at runtime. Fail the build
// instead.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const artilleryDir = path.resolve(__dirname, '..');
const packagesDir = path.resolve(artilleryDir, '..');
const targetRoot = path.join(artilleryDir, 'dist', 'builtin-packages');

const { BUILTIN_PACKAGE_NAMES } = await import(
  pathToFileURL(path.join(artilleryDir, 'dist', 'lib', 'builtin-packages.js'))
    .href
);

const artilleryPkg = JSON.parse(
  fs.readFileSync(path.join(artilleryDir, 'package.json'), 'utf8')
);

const EXCLUDE = new Set([
  'node_modules',
  'test',
  'tests',
  'doc',
  'docs',
  'coverage',
  '.turbo',
  'tsconfig.build.json'
]);

const errors = [];

fs.rmSync(targetRoot, { recursive: true, force: true });

for (const name of BUILTIN_PACKAGE_NAMES) {
  const srcDir = path.join(packagesDir, name);
  const pkgJsonPath = path.join(srcDir, 'package.json');

  if (!fs.existsSync(pkgJsonPath)) {
    errors.push(`${name}: not found at ${srcDir}`);
    continue;
  }

  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));

  // Dependency invariant
  for (const [dep, range] of Object.entries(pkg.dependencies || {})) {
    if (BUILTIN_PACKAGE_NAMES.includes(dep)) {
      errors.push(`${name}: depends on another built-in package (${dep})`);
      continue;
    }
    const artilleryRange = artilleryPkg.dependencies[dep];
    if (!artilleryRange) {
      errors.push(
        `${name}: dependency ${dep}@${range} is not declared in artillery's package.json`
      );
    } else if (artilleryRange !== range) {
      errors.push(
        `${name}: dependency ${dep}@${range} does not match artillery's range ${artilleryRange}`
      );
    }
  }

  // Entry point must exist in the copy
  const entry = pkg.main || 'index.js';
  if (!fs.existsSync(path.join(srcDir, entry))) {
    errors.push(`${name}: entry point ${entry} does not exist (not built?)`);
    continue;
  }

  fs.cpSync(srcDir, path.join(targetRoot, name), {
    recursive: true,
    dereference: true,
    filter: (src) => {
      const rel = path.relative(srcDir, src);
      if (rel === '') {
        return true;
      }
      const top = rel.split(path.sep)[0];
      return !EXCLUDE.has(top) && !src.endsWith('.png');
    }
  });
}

if (errors.length > 0) {
  console.error('copy-builtin-packages failed:');
  for (const e of errors) {
    console.error(`  - ${e}`);
  }
  process.exit(1);
}

console.log(
  `Bundled ${BUILTIN_PACKAGE_NAMES.length} built-in packages into ${path.relative(
    process.cwd(),
    targetRoot
  )}`
);
