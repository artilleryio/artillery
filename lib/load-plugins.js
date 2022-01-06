/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const debug = require('debug')('core');
const path = require('path');

// Additional paths to load plugins can be set via ARTILLERY_PLUGIN_PATH
// Additional plugin config mafy be set via ARTILLERY_PLUGINS (as JSON)
// Version may be: v1, v2, v3 or any
function loadPluginsConfig(pluginSpecs) {
  let additionalPlugins = {};

  if (process.env.ARTILLERY_PLUGINS) {
    try {
      additionalPlugins = JSON.parse(process.env.ARTILLERY_PLUGINS);
    } catch (ignoreErr) {
      debug(ignoreErr);
    }
  }

  return Object.assign({}, pluginSpecs, additionalPlugins);
}

async function loadPlugins(pluginSpecs, testScript) {
  let requirePaths = [''];

  // requirePaths = requirePaths.concat(pro.getPluginPath());

  if (process.env.ARTILLERY_PLUGIN_PATH) {
    requirePaths = requirePaths.concat(
      process.env.ARTILLERY_PLUGIN_PATH.split(':')
    );
  }

  pluginSpecs = loadPluginsConfig(pluginSpecs);

  const results = {};
  for (const [name, config] of Object.entries(pluginSpecs)) {
    const result = await loadPlugin(name, config, requirePaths, testScript);
    results[name] = result;
  }

  return results;
}

async function loadPlugin(name, config, requirePaths, testScript) {
  // TODO: Take scope in directly - don't need the full script
  let pluginConfigScope = config.scope || testScript.config.pluginsScope;
  let pluginPrefix = pluginConfigScope
    ? pluginConfigScope
    : 'artillery-plugin-';
  let requireString = pluginPrefix + name;
  let PluginExport, pluginErr, loadedFrom, version;

  for (const p of requirePaths) {
    debug('Looking for plugin in:', p);
    try {
      loadedFrom = path.join(p, requireString);
      PluginExport = require(loadedFrom);
      if (typeof PluginExport === 'function') {
        version = 1;
      } else if (
        typeof PluginExport === 'object' &&
        typeof PluginExport.Plugin === 'function'
      ) {
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
    let msg;

    if (!pluginErr) {
      msg = `WARNING: Could not initialize plugin: ${name}`;
    } else {
      if (pluginErr.code === 'MODULE_NOT_FOUND') {
        msg = `WARNING: Plugin ${name} specified but module ${requireString} could not be found (${pluginErr.code})`;
      } else {
        msg = `WARNING: Could not initialize plugin: ${name} (${pluginErr.message})`;
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

module.exports = { loadPlugins, loadPlugin, loadPluginsConfig };
