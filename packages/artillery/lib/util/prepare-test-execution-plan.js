const csv = require('csv-parse');
const fs = require('node:fs');
const path = require('node:path');
const p = require('util').promisify;

const {
  readScript,
  parseScript,
  addOverrides,
  addVariables,
  addDefaultPlugins,
  resolveConfigTemplates,
  checkConfig,
  resolveConfigPath
} = require('../../util');

const validateScript = require('./validate-script');

const _ = require('lodash');

async function prepareTestExecutionPlan(inputFiles, flags, _args) {
  const scriptPath = inputFiles[0];
  let script1 = {};

  for (const fn of inputFiles) {
    const data = await readScript(fn);
    const parsedData = await parseScript(data);
    script1 = _.merge(script1, parsedData);
  }

  script1 = await checkConfig(script1, scriptPath, flags);

  const script2 = await resolveConfigPath(script1, flags, scriptPath);

  const script3 = await addOverrides(script2, flags);
  const script4 = await addVariables(script3, flags);
  // The resolveConfigTemplates function expects the config and script path to be passed explicitly because it is used in Fargate as well where the two arguments will not be available on the script
  const script5 = await resolveConfigTemplates(
    script4,
    flags,
    script4._configPath,
    script4._scriptPath
  );

  if (!script5.config.target) {
    throw new Error('No target specified and no environment chosen');
  }

  const validationError = validateScript(script5);

  if (validationError) {
    console.log(`Scenario validation error: ${validationError}`);

    process.exit(1);
  }

  const script6 = await readPayload(script5);

  if (typeof script6.config.phases === 'undefined' || flags.solo) {
    script6.config.phases = [
      {
        duration: 1,
        arrivalCount: 1
      }
    ];
  }

  script6.config.statsInterval = script6.config.statsInterval || 30;

  const script7 = addDefaultPlugins(script5);
  const script8 = replaceProcessorIfTypescript(script7, scriptPath);

  return script8;
}

async function readPayload(script) {
  if (!script.config.payload) {
    return script;
  }

  for (const payloadSpec of script.config.payload) {
    const data = fs.readFileSync(payloadSpec.path, 'utf-8');

    const csvOpts = Object.assign(
      {
        skip_empty_lines:
          typeof payloadSpec.skipEmptyLines === 'undefined'
            ? true
            : payloadSpec.skipEmptyLines,
        cast: typeof payloadSpec.cast === 'undefined' ? true : payloadSpec.cast,
        from_line: payloadSpec.skipHeader === true ? 2 : 1,
        delimiter: payloadSpec.delimiter || ','
      },
      payloadSpec.options
    );

    try {
      const parsedData = await p(csv)(data, csvOpts);
      payloadSpec.data = parsedData;
    } catch (err) {
      throw err;
    }
  }

  return script;
}

function replaceProcessorIfTypescript(script, scriptPath) {
  const relativeProcessorPath = script.config.processor;
  const userExternalPackages = script.config.bundling?.external || [];

  if (!relativeProcessorPath) {
    return script;
  }
  const extensionType = path.extname(relativeProcessorPath);

  if (extensionType != '.ts') {
    return script;
  }

  const actualProcessorPath = path.resolve(
    path.dirname(scriptPath),
    relativeProcessorPath
  );
  const processorFileName = path.basename(actualProcessorPath, extensionType);

  const processorDir = path.dirname(actualProcessorPath);
  const newProcessorPath = path.join(
    processorDir,
    `dist/${processorFileName}.js`
  );

  //TODO: move require to top of file when Lambda bundle size issue is solved
  //must be conditionally required for now as this package is removed in Lambda for now to avoid bigger package sizes
  const esbuild = require('esbuild-wasm');

  try {
    esbuild.buildSync({
      entryPoints: [actualProcessorPath],
      outfile: newProcessorPath,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      sourcemap: 'inline',
      external: ['@playwright/test', ...userExternalPackages]
    });
  } catch (error) {
    throw new Error(`Failed to compile Typescript processor\n${error.message}`);
  }

  global.artillery.hasTypescriptProcessor = newProcessorPath;
  console.log(
    `Bundled Typescript file into JS. New processor path: ${newProcessorPath}`
  );

  script.config.processor = newProcessorPath;
  return script;
}

module.exports = prepareTestExecutionPlan;
