const path = require('path');
const fs = require('fs');
const A = require('async');

const isBuiltinModule = require('is-builtin-module');
const detective = require('detective');
const depTree = require('dependency-tree');

const walkSync = require('walk-sync');
const debug = require('debug')('bom');
const _ = require('lodash');
const BUILTIN_PLUGINS = require('./plugins').getAllPluginNames();
const BUILTIN_ENGINES = require('./plugins').getOfficialEngines();

const Table = require('cli-table3');

// NOTE: Code below presumes that all paths are absolute

function createBOM(absoluteScriptPath, extraFiles, opts, callback) {
  A.waterfall(
    [
      A.constant(absoluteScriptPath),
      global.artillery.__util.readScript,
      global.artillery.__util.parseScript,
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
      getFileUploadPluginFiles,
      getExtraFiles,
      expandDirectories
    ],

    function (err, context) {
      if (err) {
        return callback(err, null);
      }

      context.localFilePaths = context.localFilePaths.concat(extraFiles);

      // TODO: Entries in localFilePaths may be directories

      // How many entries do we have here? If we have only one entry, the string itself
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

function isLocalModule(modName) {
  // NOTE: Absolute paths not supported
  return modName.startsWith('.');
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
  let environmentEngines = _.reduce(
    _.get(context, 'opts.scriptData.config.environments', {}),
    function getEnvironmentEngines(acc, envSpec, envName) {
      acc = acc.concat(Object.keys(envSpec.engines || []));
      return acc;
    },
    []
  );

  const engineNames = Object.keys(
    _.get(context, 'opts.scriptData.config.engines', {})
  ).concat(environmentEngines);

  const enginePackages = _.uniq(
    engineNames
      .filter((p) => BUILTIN_ENGINES.indexOf(p) === -1)
      .map((p) => `artillery-engine-${p}`)
  );

  context.npmModules = context.npmModules.concat(enginePackages);

  return next(null, context);
}

function getCustomJsDependencies(context, next) {
  if (
    context.opts.scriptData.config &&
    context.opts.scriptData.config.processor
  ) {
    //
    // Path to the main processor file:
    //
    const procPath = path.resolve(
      path.dirname(context.opts.absoluteScriptPath),
      context.opts.scriptData.config.processor
    );
    context.localFilePaths.push(procPath);

    // Get the tree of requires from the main processor file:
    const tree = depTree.toList({
      filename: procPath,
      directory: path.dirname(context.opts.absoluteScriptPath),
      filter: (path) => path.indexOf('node_modules') === -1 // optional
    });

    debug('tree');
    debug(tree);

    function getNpmDependencies(filename) {
      const src = fs.readFileSync(filename);
      const requires = detective(src);
      const npmPackages = requires
        .filter(
          (requireString) =>
            !isBuiltinModule(requireString) && !isLocalModule(requireString)
        )
        .map((requireString) => {
          return requireString.startsWith('@')
            ? requireString.split('/')[0] + '/' + requireString.split('/')[1]
            : requireString.split('/')[0];
        });
      return npmPackages;
    }

    const allNpmDeps = tree.map(getNpmDependencies);
    debug(allNpmDeps);
    const reduced = allNpmDeps.reduce((acc, deps) => {
      deps.forEach((d) => {
        if (acc.findIndex((x) => x === d) === -1) {
          acc.push(d);
        }
      });
      return acc;
    }, []);
    debug(reduced);

    //
    // Any other local JS files and npm packages:
    //
    const procSrc = fs.readFileSync(procPath);
    const processorRequires = detective(procSrc);
    // TODO: Look for and load dir/index.js and get its dependencies,
    // rather than just grabbing the entire directory.
    // NOTE: Some of these may be directories (with an index.js inside)
    // Could be JSON files too.
    context.localFilePaths = context.localFilePaths.concat(tree);
    context.npmModules = context.npmModules.concat(reduced);
    debug('got custom JS dependencies');
    return next(null, context);
  } else {
    debug('no custom JS dependencies');
    return next(null, context);
  }
}

function getVariableDataFiles(context, next) {
  // NOTE: assuming that context.opts.scriptData contains both the config and
  // the scenarios section here.

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
        // isObject returns true for arrays, so this branch must come second
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

function getFileUploadPluginFiles(context, next) {
  if (
    context.opts.scriptData.config &&
    context.opts.scriptData.config.plugins &&
    context.opts.scriptData.config.plugins['http-file-uploads']
  ) {
    // Append filePaths array if it's there:

    if (context.opts.scriptData.config.plugins['http-file-uploads'].filePaths) {
      const absPaths = context.opts.scriptData.config.plugins[
        'http-file-uploads'
      ].filePaths.map((p) => {
        return path.resolve(path.dirname(context.opts.absoluteScriptPath), p);
      });
      context.localFilePaths = context.localFilePaths.concat(absPaths);
    }
    return next(null, context);
  } else {
    return next(null, context);
  }
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

function expandDirectories(context, next) {
  // This can potentially lead to VERY unexpected behaviour, when used
  // without due care with the file upload plugin (if filePaths is pointed at
  // a directory that contains files OTHER than those to be used with the
  // plugin)
  //
  // TODO: Warn if there are too many files in the directory
  // TODO: Only allow specific filenames or globs, not directories
  debug(context.localFilePaths);
  // FIXME: Don't need to scan twice:
  const dirs = context.localFilePaths.filter((p) => {
    let result = false;
    try {
      result = fs.statSync(p).isDirectory();
    } catch (fsErr) {}
    return result;
  });
  // Remove directories from the list:
  context.localFilePaths = context.localFilePaths.filter((p) => {
    let result = true;
    try {
      result = !fs.statSync(p).isDirectory();
    } catch (fsErr) {}
    return result;
  });

  debug('Dirs to expand');
  debug(dirs);
  dirs.forEach((d) => {
    const entries = walkSync.entries(d, { directories: false });
    debug(entries);
    context.localFilePaths = context.localFilePaths.concat(
      entries.map((e) => {
        return path.resolve(d, e.relativePath);
      })
    );
  });

  return next(null, context);
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
  artillery.logger({ showTimestamp: true }).log('Test bundle prepared...');
  artillery.log('Test bundle contents:');
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
