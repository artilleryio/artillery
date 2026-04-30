const path = require('node:path');
const fs = require('node:fs');
const A = require('async');

const { isBuiltin } = require('node:module');

const walkSync = require('walk-sync');
const debug = require('debug')('bom');
const _ = require('lodash');
const BUILTIN_PLUGINS = require('./plugins').getAllPluginNames();
const BUILTIN_ENGINES = require('./plugins').getOfficialEngines();

const Table = require('cli-table3');

const { resolveConfigTemplates } = require('../../../../util');

const prepareTestExecutionPlan = require('../../../../lib/util/prepare-test-execution-plan');
const { readScript, parseScript } = require('../../../../util');

// NOTE: Code below presumes that all paths are absolute

//Tests in Fargate run on ubuntu, which uses posix paths
//This function converts a path to posix path, in case the original path was not posix (e.g. windows runs)
function _convertToPosixPath(p) {
  return p.split(path.sep).join(path.posix.sep);
}

// NOTE: absoluteScriptPath here is actually the absolute path to the config file
function createBOM(absoluteScriptPath, extraFiles, opts, callback) {
  A.waterfall(
    [
      A.constant(absoluteScriptPath),
      async (scriptPath) => {
        let scriptData;
        if (scriptPath.toLowerCase().endsWith('.ts')) {
          scriptData = await prepareTestExecutionPlan(
            [scriptPath],
            opts.flags,
            []
          );
          scriptData.config.processor = scriptPath;
        } else {
          const data = await readScript(scriptPath);
          scriptData = await parseScript(data);
        }

        return scriptData;
      },
      (scriptData, next) => {
        return next(null, {
          opts: {
            scriptData,
            absoluteScriptPath,
            flags: opts.flags,
            scenarioPath: opts.scenarioPath // Absolute path to the file that holds scenarios
          },
          localFilePaths: [absoluteScriptPath],
          npmModules: []
        });
      },
      applyScriptChanges,
      getPlugins,
      getCustomEngines,
      getCustomJsDependencies,
      getVariableDataFiles,
      getFileUploadPluginFiles,
      getExtraFiles,
      getDotEnv,
      expandDirectories
    ],

    (err, context) => {
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

      prefix = _convertToPosixPath(prefix);
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

      dependencyFiles.forEach((p) => {
        try {
          if (fs.statSync(p)) {
            context.localFilePaths.push(p);
          }
        } catch (_ignoredErr) {}
      });

      const files = context.localFilePaths.map((p) => {
        return {
          orig: p,
          noPrefix: p.substring(prefix.length, p.length),
          origPosix: _convertToPosixPath(p),
          noPrefixPosix: _convertToPosixPath(p).substring(
            prefix.length,
            p.length
          )
        };
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

      const modules = _.uniq(context.npmModules).filter(
        (m) =>
          m !== 'artillery' &&
          m !== 'playwright' &&
          !m.startsWith('@playwright/')
      );

      const moduleVersions = context.moduleVersions || {};
      const unresolvedImports = context.unresolvedImports || [];

      const declaredDeps = new Set(context.pkgDeps);
      const externals = [];
      for (const m of modules) {
        if (!declaredDeps.has(m)) {
          externals.push({ name: m, reason: 'not-in-package-json' });
        }
      }
      for (const u of unresolvedImports) {
        externals.push({ name: u.name, reason: u.reason });
      }

      return callback(null, {
        files: _.uniqWith(files, _.isEqual),
        modules,
        pkgDeps: context.pkgDeps,
        fullyResolvedConfig: context.opts.scriptData.config,
        moduleVersions,
        externals
      });
    }
  );
}

function applyScriptChanges(context, next) {
  resolveConfigTemplates(
    context.opts.scriptData,
    context.opts.flags,
    context.opts.absoluteScriptPath,
    context.opts.scenarioPath
  ).then((resolvedConfig) => {
    context.opts.scriptData = resolvedConfig;
    return next(null, context);
  });
}

function getPlugins(context, next) {
  const environmentPlugins = _.reduce(
    _.get(context, 'opts.scriptData.config.environments', {}),
    function getEnvironmentPlugins(acc, envSpec, _envName) {
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
  const environmentEngines = _.reduce(
    _.get(context, 'opts.scriptData.config.environments', {}),
    function getEnvironmentEngines(acc, envSpec, _envName) {
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

// async waterfall passes ONE arg to async functions and reads the result via
// the returned promise — no `next` callback. Throws propagate as errors.
async function getCustomJsDependencies(context) {
  const scriptPath = context.opts.absoluteScriptPath;
  const isTypeScriptEntry = scriptPath.toLowerCase().endsWith('.ts');
  const resolveRoot = path.dirname(scriptPath);

  const entries = [];

  // .ts script entry: trace the script itself (handles imports in script body
  // when prepareTestExecutionPlan ingests TypeScript modules).
  if (isTypeScriptEntry) {
    entries.push(scriptPath);
  }

  // Pick the user-declared processor path. If prepareTestExecutionPlan
  // bundled a .ts processor to dist/ and stashed __originalProcessor, use that
  // — we want to trace the original source, not the already-bundled output.
  const originalProcessor = context.opts.scriptData.__originalProcessor;
  const declaredProcessor = context.opts.scriptData.config?.processor;
  let processorEntry = null;

  if (originalProcessor) {
    processorEntry = originalProcessor;
  } else if (declaredProcessor) {
    const resolved = path.resolve(resolveRoot, declaredProcessor);
    // bom.js applyScriptChanges sets config.processor = scriptPath for .ts
    // entries (preserving older dep-tree behaviour). Avoid double-tracing.
    if (resolved !== scriptPath) {
      processorEntry = resolved;
    }
  }

  if (processorEntry && !entries.includes(processorEntry)) {
    entries.push(processorEntry);
  }

  context.moduleVersions = context.moduleVersions || {};
  context.unresolvedImports = context.unresolvedImports || [];

  if (entries.length === 0) {
    debug('no custom JS dependencies');
    return context;
  }

  const traceResult = await traceDependencies(entries, resolveRoot);

  context.localFilePaths = _.uniq(
    context.localFilePaths.concat(traceResult.localFiles)
  );
  context.npmModules = context.npmModules.concat(traceResult.npmPackages);

  for (const pkg of traceResult.npmPackages) {
    if (context.moduleVersions[pkg]) continue;
    const version = resolvePackageVersion(pkg, resolveRoot);
    if (version) context.moduleVersions[pkg] = version;
  }

  context.unresolvedImports = context.unresolvedImports.concat(
    traceResult.unresolved
  );

  debug('got custom JS dependencies via esbuild');
  return context;
}

// esbuild-wasm's initialize() can only be called once per process. Memoize
// the promise so concurrent or repeat trace calls share a single init.
// This is the only call site for initialize() in the codebase
// (prepare-test-execution-plan.js uses buildSync, which doesn't need init),
// so we don't need to defend against external "already initialized" errors.
let esbuildInitPromise = null;
function ensureEsbuildInitialized(esbuild) {
  if (!esbuildInitPromise) {
    esbuildInitPromise = esbuild.initialize({});
  }
  return esbuildInitPromise;
}

async function traceDependencies(entries, resolveRoot) {
  // Lazy-required: esbuild-wasm has historically been stripped from the
  // Lambda image to control size. Lazy require keeps this module loadable
  // when esbuild-wasm isn't installed (e.g. inside the Lambda function
  // when only YAML/JSON scripts are used and trace is never invoked).
  const esbuild = require('esbuild-wasm');

  const unresolved = [];

  const recoverPlugin = {
    name: 'artillery-recover-unresolved',
    setup(build) {
      build.onResolve({ filter: /^\.{1,2}\// }, (args) => {
        const candidate = path.resolve(args.resolveDir, args.path);
        const exts = [
          '',
          '.js',
          '.mjs',
          '.cjs',
          '.ts',
          '.tsx',
          '.json',
          '/index.js',
          '/index.mjs',
          '/index.cjs',
          '/index.ts',
          '/index.tsx'
        ];
        for (const ext of exts) {
          try {
            if (fs.statSync(candidate + ext).isFile()) {
              return null;
            }
          } catch (_e) {}
        }
        unresolved.push({
          name: args.path,
          reason: 'unresolved-relative',
          importer: args.importer
        });
        return { path: args.path, external: true };
      });
    }
  };

  // esbuild-wasm doesn't support plugins via buildSync. Need the async API,
  // which in turn requires a one-time initialize(). prepareTestExecutionPlan
  // uses buildSync directly without initialize — that path stays sync and
  // doesn't conflict with this one (initialize is idempotent within a
  // single process; buildSync works either way).
  await ensureEsbuildInitialized(esbuild);

  const result = await esbuild.build({
    entryPoints: entries,
    bundle: true,
    write: false,
    metafile: true,
    packages: 'external',
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
    absWorkingDir: resolveRoot,
    plugins: [recoverPlugin]
  });

  const localFiles = new Set();
  const npmPackages = new Set();

  for (const inputPath of Object.keys(result.metafile.inputs)) {
    const input = result.metafile.inputs[inputPath];
    const absInputPath = path.isAbsolute(inputPath)
      ? inputPath
      : path.resolve(resolveRoot, inputPath);

    if (!absInputPath.includes(`${path.sep}node_modules${path.sep}`)) {
      localFiles.add(absInputPath);
    }

    for (const imp of input.imports || []) {
      if (!imp.external) continue;
      if (isBuiltin(imp.path)) continue;
      const pkgName = extractPackageName(imp.path);
      if (pkgName) npmPackages.add(pkgName);
    }
  }

  return {
    localFiles: Array.from(localFiles),
    npmPackages: Array.from(npmPackages),
    unresolved
  };
}

function extractPackageName(spec) {
  if (spec.startsWith('@')) {
    const parts = spec.split('/');
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
  }
  return spec.split('/')[0];
}

function resolvePackageVersion(pkgName, resolveRoot) {
  try {
    const pkgJsonPath = require.resolve(`${pkgName}/package.json`, {
      paths: [resolveRoot]
    });
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    return pkg.version || null;
  } catch (_err) {
    return null;
  }
}

function getVariableDataFiles(context, next) {
  // NOTE: assuming that context.opts.scriptData contains both the config and
  // the scenarios section here.

  // Iterate over environments

  function resolvePayloadPaths(obj) {
    const result = [];
    if (obj.payload) {
      // When using a separate config file, resolve paths relative to the scenario file
      // Otherwise, resolve relative to the config file
      const baseDir = context.opts.scenarioPath
        ? path.dirname(context.opts.scenarioPath)
        : path.dirname(context.opts.absoluteScriptPath);

      if (_.isArray(obj.payload)) {
        obj.payload.forEach((payloadSpec) => {
          result.push(path.resolve(baseDir, payloadSpec.path));
        });
      } else if (_.isObject(obj.payload)) {
        // isObject returns true for arrays, so this branch must come second
        result.push(path.resolve(baseDir, obj.payload.path));
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
  if (context.opts.scriptData.config?.plugins?.['http-file-uploads']) {
    // Append filePaths array if it's there:

    if (context.opts.scriptData.config.plugins['http-file-uploads'].filePaths) {
      // When using a separate config file, resolve paths relative to the scenario file
      // Otherwise, resolve relative to the config file
      const baseDir = context.opts.scenarioPath
        ? path.dirname(context.opts.scenarioPath)
        : path.dirname(context.opts.absoluteScriptPath);

      const absPaths = context.opts.scriptData.config.plugins[
        'http-file-uploads'
      ].filePaths.map((p) => {
        return path.resolve(baseDir, p);
      });
      context.localFilePaths = context.localFilePaths.concat(absPaths);
    }
    return next(null, context);
  } else {
    return next(null, context);
  }
}

function getExtraFiles(context, next) {
  if (context.opts.scriptData.config?.includeFiles) {
    // When using a separate config file, resolve paths relative to the scenario file
    // Otherwise, resolve relative to the config file
    const baseDir = context.opts.scenarioPath
      ? path.dirname(context.opts.scenarioPath)
      : path.dirname(context.opts.absoluteScriptPath);

    const absPaths = _.map(context.opts.scriptData.config.includeFiles, (p) => {
      const includePath = path.resolve(baseDir, p);
      debug('includeFile:', includePath);
      return includePath;
    });
    context.localFilePaths = context.localFilePaths.concat(absPaths);
    return next(null, context);
  } else {
    return next(null, context);
  }
}

function getDotEnv(context, next) {
  const flags = context.opts.flags;
  if (!flags.dotenv || flags.platform === 'aws:ecs') {
    return next(null, context);
  }

  const dotEnvPath = path.resolve(process.cwd(), flags.dotenv);
  try {
    if (fs.statSync(dotEnvPath)) {
      context.localFilePaths.push(dotEnvPath);
    }
  } catch (_ignoredErr) {
    console.log(`WARNING: could not find dotenv file: ${flags.dotenv}`);
  }

  return next(null, context);
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
    } catch (_fsErr) {}
    return result;
  });
  // Remove directories from the list:
  context.localFilePaths = context.localFilePaths.filter((p) => {
    let result = true;
    try {
      result = !fs.statSync(p).isDirectory();
    } catch (_fsErr) {}
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
    const version = manifest.moduleVersions?.[m];
    const notes = [];
    if (manifest.pkgDeps.indexOf(m) === -1) notes.push('not in package.json');
    if (version) notes.push(`v${version}`);
    t.push([m, 'package', notes.join(' · ')]);
  }
  artillery.log(t.toString());

  const unresolvedExternals = (manifest.externals || []).filter(
    (e) => e.reason !== 'not-in-package-json'
  );
  if (unresolvedExternals.length > 0) {
    artillery.log('Unresolved imports:');
    const u = new Table({ head: ['Name', 'Reason'] });
    for (const e of unresolvedExternals) {
      u.push([e.name, e.reason]);
    }
    artillery.log(u.toString());
  }
  artillery.log();
}

function enrichPackageJson(content, moduleVersions) {
  const pkg = typeof content === 'string' ? JSON.parse(content) : content;

  const filterBundled = (deps) => {
    if (!deps) return deps;
    const filtered = {};
    for (const [name, version] of Object.entries(deps)) {
      if (
        name !== 'artillery' &&
        name !== 'playwright' &&
        !name.startsWith('@playwright/')
      ) {
        filtered[name] = version;
      }
    }
    return filtered;
  };

  pkg.dependencies = filterBundled(pkg.dependencies) || {};
  pkg.devDependencies = filterBundled(pkg.devDependencies);

  // Add detected modules that aren't already declared. Pin to exact version
  // so the remote runner installs what we observed locally.
  if (moduleVersions) {
    for (const [name, version] of Object.entries(moduleVersions)) {
      if (!version) continue;
      if (
        name === 'artillery' ||
        name === 'playwright' ||
        name.startsWith('@playwright/')
      )
        continue;
      const inDeps = pkg.dependencies && pkg.dependencies[name];
      const inDev = pkg.devDependencies && pkg.devDependencies[name];
      if (!inDeps && !inDev) {
        pkg.dependencies[name] = version;
      }
    }
  }

  return JSON.stringify(pkg, null, 2);
}

module.exports = {
  createBOM,
  commonPrefix,
  prettyPrint,
  applyScriptChanges,
  enrichPackageJson
};
