/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import createDebug from 'debug';
import { BUILTIN_PACKAGES_DIR } from './builtin-packages.ts';

const debug = createDebug('core');
const require = createRequire(import.meta.url);

// Result of attempting to load one plugin. Failures carry a
// user-facing message; successes carry the loaded module and the
// detected plugin API version (undefined when the module loaded but
// its shape was not recognized).
export type PluginLoadResult = PluginLoadFailure | LoadedPlugin;

export interface PluginLoadFailure {
  name: string;
  isLoaded: false;
  isInitialized: false;
  msg: string;
  error: unknown;
}

export interface LoadedPlugin {
  name: string;
  isLoaded: true;
  isInitialized: false;
  // v1: constructor function; v2: { Plugin } module. Typed as any
  // until consumers (launch-platform, worker) migrate to guarded
  // narrowing - see modernization plan F6.
  PluginExport: any;
  loadedFrom: string | undefined;
  // 3 is reserved for a future plugin interface - loadPlugin never
  // produces it today, but consumers already branch on it.
  version: 1 | 2 | 3 | undefined;
  // Instantiated plugin, attached by consumers after construction:
  plugin?: any;
}

// Additional paths to load plugins can be set via ARTILLERY_PLUGIN_PATH
// Additional plugin config mafy be set via ARTILLERY_PLUGINS (as JSON)
// Version may be: v1, v2, v3 or any
function loadPluginsConfig(
  pluginSpecs: Record<string, unknown> | undefined
): Record<string, unknown> {
  let additionalPlugins: Record<string, unknown> = {};

  if (process.env.ARTILLERY_PLUGINS) {
    try {
      additionalPlugins = JSON.parse(process.env.ARTILLERY_PLUGINS);
    } catch (ignoreErr) {
      debug(ignoreErr);
    }
  }

  return Object.assign({}, pluginSpecs, additionalPlugins);
}

async function loadPlugins(
  pluginSpecs: Record<string, unknown> | undefined,
  testScript: Record<string, any>,
  _opts?: unknown
): Promise<Record<string, PluginLoadResult>> {
  // Bare specifier first (user-installed copies win), bundled built-in
  // packages second, ARTILLERY_PLUGIN_PATH entries last
  let requirePaths = ['', BUILTIN_PACKAGES_DIR];

  if (process.env.ARTILLERY_PLUGIN_PATH) {
    requirePaths = requirePaths.concat(
      process.env.ARTILLERY_PLUGIN_PATH.split(':')
    );
  }

  pluginSpecs = loadPluginsConfig(pluginSpecs);

  const results: Record<string, PluginLoadResult> = {};
  for (const [name, config] of Object.entries(pluginSpecs)) {
    const result = await loadPlugin(name, config, requirePaths, testScript);
    results[name] = result;
  }

  return results;
}

async function loadPlugin(
  name: string,
  config: any,
  requirePaths: string[],
  testScript: Record<string, any>
): Promise<PluginLoadResult> {
  // TODO: Take scope in directly - don't need the full script
  const pluginConfigScope = config.scope || testScript.config.pluginsScope;
  const pluginPrefix = pluginConfigScope
    ? pluginConfigScope
    : 'artillery-plugin-';
  const requireString = pluginPrefix + name;
  let PluginExport: any;
  let pluginErr: unknown;
  let loadedFrom: string | undefined;
  let version: 1 | 2 | undefined;

  for (const p of requirePaths) {
    debug('Looking for plugin in:', p);
    try {
      loadedFrom = path.join(p, requireString);
      // Resolve with CJS semantics (bare specifiers, directories via
      // package.json "main"), load with import() - handles both CJS
      // and ESM plugins, including ESM with top-level await
      const resolvedPath = require.resolve(loadedFrom);
      const ns = await import(pathToFileURL(resolvedPath).href);
      // CJS: default === module.exports; ESM: unwrap default export,
      // fall back to the namespace (named exports, e.g. Plugin)
      PluginExport = ns.default ?? ns;
      if (typeof PluginExport === 'function') {
        version = 1;
      } else if (
        typeof PluginExport === 'object' &&
        typeof PluginExport.Plugin === 'function'
      ) {
        version = 2;
      } else if (typeof ns.Plugin === 'function') {
        // ESM plugin with a named Plugin export alongside a
        // non-function default export
        PluginExport = ns;
        version = 2;
      } // TODO: Add v3
    } catch (err) {
      debug(err);
      pluginErr = err;
    }

    if (typeof PluginExport !== 'undefined') {
      break;
    }
  }

  if (!PluginExport) {
    let msg: string;

    if (!pluginErr) {
      msg = `WARNING: Could not initialize plugin: ${name}`;
    } else {
      const err = pluginErr as NodeJS.ErrnoException;
      if (err.code === 'MODULE_NOT_FOUND') {
        msg = `WARNING: Plugin ${name} specified but module ${requireString} could not be found (${err.code})`;
      } else {
        msg = `WARNING: Could not initialize plugin: ${name} (${err.message})`;
      }
    }

    return {
      name,
      isLoaded: false,
      isInitialized: false,
      msg: msg,
      error: pluginErr
    };
  } else {
    debug('Plugin %s loaded from %s', name, requireString);
    return {
      name,
      isLoaded: true,
      isInitialized: false,

      PluginExport,
      loadedFrom,
      version
    };
  }
}

export { loadPlugins, loadPlugin, loadPluginsConfig };
