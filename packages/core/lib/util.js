/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const path = require('path');
const fs = require('fs');

function determineModuleTypeByPackageJson(filePath) {
  // If it's .js, we need to check the package.json
  try {
    // Start from script directory and move up until we find package.json
    let dir = path.dirname(filePath);
    while (dir !== path.parse(dir).root) {
      try {
        const pkgPath = path.join(dir, 'package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        return pkg.type === 'module' ? 'esm' : 'commonjs';
      } catch (err) {
        dir = path.dirname(dir);
      }
    }

    // No package.json found, default to commonjs
    return 'commonjs';
  } catch (err) {
    return 'commonjs';
  }
}

function determineModuleType(filePath) {
  if (filePath.endsWith('.mjs')) return 'esm';
  if (filePath.endsWith('.cjs')) return 'commonjs';

  return determineModuleTypeByPackageJson(filePath);
}

/**
 * Determine if a package is ESM or not.
 * @param {string | undefined} filePath Path to the package.json file. If not provided, it will default to the current working directory.
 * @returns A boolean indicating if the package is ESM or not.
 */
function isPackageESM(filePath) {
  if (!filePath) filePath = process.cwd();

  return determineModuleType(filePath) === 'esm';
}

/**
 * Determine if a package is CommonJS or not.
 * @param {string | undefined} filePath Path to the package.json file. If not provided, it will default to the current working directory.
 * @returns A boolean indicating if the package is CommonJS or not.
 */
function isPackageCommonJS(filePath) {
  if (!filePath) filePath = process.cwd();

  return determineModuleType(filePath) === 'commonjs';
}

module.exports = {
  determineModuleType,
  isPackageESM,
  isPackageCommonJS
};
