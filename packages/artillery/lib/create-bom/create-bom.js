/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// TODO: async-ify this

const path = require('path');
const fs = require('fs');
const A = require('async');
const debug = require('debug')('bom');
const _ = require('lodash');
const Table = require('cli-table3');
const { getCustomJsDependencies } = require('../platform/aws-ecs/legacy/bom');

const { readScript, parseScript } = require('../util');

const BUILTIN_PLUGINS = require('./built-in-plugins');

// NOTE: Presumes ALL paths are absolute.
async function createBOM(absoluteScriptPath, extraFiles, opts, callback) {
  A.waterfall(
    [
      A.constant(absoluteScriptPath),
      readScript,
      parseScript,
      (scriptData, next) => {
        return next(null, {
          opts: {
            scriptData,
            absoluteScriptPath
          },
          localFilePaths: [absoluteScriptPath],
          npmModules: []
        });
      },
      getPlugins,
      getCustomEngines,
      getCustomJsDependencies,
      getVariableDataFiles,
      // getFileUploadPluginFiles,
      getExtraFiles
      // expandDirectories
    ],

    function (err, context) {
      if (err) {
        return callback(err, null);
      }

      context.localFilePaths = context.localFilePaths.concat(extraFiles);

      // TODO: Entries in localFilePaths may be directories

      // Handle case with only one entry, where the string itself
      // will be the common prefix, meaning that when we substring() on it later, we'll
      // get an empty string, ending up with a manifest like:
      // { files:
      //   [ { orig: '/Users/h/tmp/artillery/hello.yaml', noPrefix: '' } ],
      //   modules: [] }
      //
      let prefix = '';
      if (context.localFilePaths.length === 1) {
        prefix = context.localFilePaths[0].substring(
          0,
          context.localFilePaths[0].length -
            path.basename(context.localFilePaths[0]).length
        );

        // This may still be an empty string if the script path is just 'hello.yml':
        prefix = prefix.length === 0 ? context.localFilePaths[0] : prefix;
      } else {
        prefix = commonPrefix(context.localFilePaths);
      }

      debug('prefix', prefix);

      //
      // include package.json / package-lock.json / yarn.lock
      //
      let packageDescriptionFiles = ['.npmrc'];
      if (opts.packageJsonPath) {
        packageDescriptionFiles.push(opts.packageJsonPath);
      } else {
        packageDescriptionFiles = packageDescriptionFiles.concat([
          'package.json',
          'package-lock.json',
          'yarn.lock'
        ]);
      }
      const dependencyFiles = packageDescriptionFiles.map((s) =>
        path.join(prefix, s)
      );

      debug(dependencyFiles);

      dependencyFiles.forEach(function (p) {
        try {
          if (fs.statSync(p)) {
            context.localFilePaths.push(p);
          }
        } catch (ignoredErr) {}
      });

      const files = context.localFilePaths.map((p) => {
        return { orig: p, noPrefix: p.substring(prefix.length, p.length) };
      });

      const pkgPath = _.find(files, (f) => {
        return f.noPrefix === 'package.json';
      });

      if (pkgPath) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath.orig, 'utf8'));
        const pkgDeps = [].concat(
          Object.keys(pkg.dependencies || {}),
          Object.keys(pkg.devDependencies || {})
        );
        context.pkgDeps = pkgDeps;
        context.npmModules = _.uniq(context.npmModules.concat(pkgDeps)).sort();
      } else {
        context.pkgDeps = [];
      }

      return callback(null, {
        files: _.uniqWith(files, _.isEqual),
        modules: _.uniq(context.npmModules),
        pkgDeps: context.pkgDeps
      });
    }
  );
}

function getPlugins(context, next) {
  let environmentPlugins = _.reduce(
    _.get(context, 'opts.scriptData.config.environments', {}),
    function getEnvironmentPlugins(acc, envSpec, envName) {
      acc = acc.concat(Object.keys(envSpec.plugins || []));
      return acc;
    },
    []
  );
  const pluginNames = Object.keys(
    _.get(context, 'opts.scriptData.config.plugins', {})
  ).concat(environmentPlugins);

  const pluginPackages = _.uniq(
    pluginNames
      .filter((p) => BUILTIN_PLUGINS.indexOf(p) === -1)
      .map((p) => `artillery-plugin-${p}`)
  );

  debug(pluginPackages);
  context.npmModules = context.npmModules.concat(pluginPackages);

  return next(null, context);
}

function getCustomEngines(context, next) {
  // TODO: Environment-specific engines (see getPlugins())
  const engineNames = _.uniq(
    Object.keys(_.get(context, 'opts.scriptData.config.engines', {}))
  );
  const enginePackages = engineNames.map((x) => `artillery-engine-${x}`);
  context.npmModules = context.npmModules.concat(enginePackages);

  return next(null, context);
}

function getVariableDataFiles(context, next) {
  // NOTE: Presuming that the script has been run through the functions
  // that normalize the config.payload definition (presume it's an array).
  // Also assuming that context.opts.scriptData contains both the config and
  // the scenarios section.

  // Iterate over environments

  function resolvePayloadPaths(obj) {
    let result = [];
    if (obj.payload) {
      if (_.isArray(obj.payload)) {
        obj.payload.forEach((payloadSpec) => {
          result.push(
            path.resolve(
              path.dirname(context.opts.absoluteScriptPath),
              payloadSpec.path
            )
          );
        });
      } else if (_.isObject(obj.payload)) {
        // NOTE: isObject returns true for arrays, so this branch must
        // come second.
        result.push(
          path.resolve(
            path.dirname(context.opts.absoluteScriptPath),
            obj.payload.path
          )
        );
      }
    }
    return result;
  }

  context.localFilePaths = context.localFilePaths.concat(
    resolvePayloadPaths(context.opts.scriptData.config)
  );
  context.opts.scriptData.config.environments =
    context.opts.scriptData.config.environments || {};
  Object.keys(context.opts.scriptData.config.environments).forEach(
    (envName) => {
      const envSpec = context.opts.scriptData.config.environments[envName];
      context.localFilePaths = context.localFilePaths.concat(
        resolvePayloadPaths(envSpec)
      );
    }
  );
  return next(null, context);
}

function getExtraFiles(context, next) {
  if (
    context.opts.scriptData.config &&
    context.opts.scriptData.config.includeFiles
  ) {
    const absPaths = _.map(context.opts.scriptData.config.includeFiles, (p) => {
      const includePath = path.resolve(
        path.dirname(context.opts.absoluteScriptPath),
        p
      );
      debug('includeFile:', includePath);
      return includePath;
    });
    context.localFilePaths = context.localFilePaths.concat(absPaths);
    return next(null, context);
  } else {
    return next(null, context);
  }
}

function commonPrefix(paths, separator) {
  if (
    !paths ||
    paths.length === 0 ||
    paths.filter((s) => typeof s !== 'string').length > 0
  ) {
    return '';
  }

  if (paths.includes('/')) {
    return '/';
  }

  const sep = separator ? separator : path.sep;

  const splitPaths = paths.map((p) => p.split(sep));
  const shortestPath = splitPaths.reduce((a, b) => {
    return a.length < b.length ? a : b;
  }, splitPaths[0]);

  let furthestIndex = shortestPath.length;

  for (const p of splitPaths) {
    for (let i = 0; i < furthestIndex; i++) {
      if (p[i] !== shortestPath[i]) {
        furthestIndex = i;
        break;
      }
    }
  }

  const joined = shortestPath.slice(0, furthestIndex).join(sep);

  if (joined.length > 0) {
    // Check if joined path already ends with separator which
    // will happen when input is a root drive on Windows, e.g. "C:\"
    return joined.endsWith(sep) ? joined : joined + sep;
  } else {
    return '';
  }
}

function prettyPrint(manifest) {
  const t = new Table({ head: ['Name', 'Type', 'Notes'] });
  for (const f of manifest.files) {
    t.push([f.noPrefix, 'file']);
  }
  for (const m of manifest.modules) {
    t.push([
      m,
      'package',
      manifest.pkgDeps.indexOf(m) === -1 ? 'not in package.json' : ''
    ]);
  }
  artillery.log(t.toString());
  artillery.log();
}

module.exports = { createBOM, commonPrefix, prettyPrint };
