import fs from 'node:fs';
import path from 'node:path';
import createDebug from 'debug';
import YAML from 'js-yaml';

const debug = createDebug('util');

import chalk from 'chalk';
import _ from 'lodash';
import moment from 'moment';
import type { Config, PayloadConfig, TestScript } from '../types.js';
import { engine_util as engineUtil } from './commons/index.ts';

const renderVariables = engineUtil._renderVariables;
const template = engineUtil.template;

import { runner as __runner } from './core/index.ts';

const { contextFuncs } = __runner;

import { promisify as p } from 'node:util';

// A test script after checkConfig(): config is guaranteed, payload is
// normalized to an array, internal path/environment markers are set.
// The index signature admits internal fields attached along the
// preparation pipeline (__transpiledTypeScriptPath etc.).
export type MergedScript = TestScript & {
  config: Config;
  _environment?: string;
  _scriptPath?: string;
  _configPath?: string;
  [key: string]: unknown;
};

// CLI flags consumed by the script preparation helpers.
export interface ScriptPrepFlags {
  environment?: string;
  target?: string;
  insecure?: boolean;
  payload?: string;
  config?: string;
  overrides?: string;
  variables?: string;
  [flag: string]: unknown;
}

export {
  readScript,
  parseScript,
  addOverrides,
  addVariables,
  addDefaultPlugins,
  resolveConfigPath,
  resolveConfigTemplates,
  checkConfig,
  renderVariables,
  template,
  formatDuration,
  padded,
  rainbow
};
async function readScript(scriptPath: string): Promise<string> {
  const data = p(fs.readFile)(scriptPath, 'utf-8') as Promise<string>;
  return data;
}

async function parseScript(data: string): Promise<TestScript> {
  // js-yaml v3 types say string | object | undefined; scripts are
  // objects. Structural validation happens later in the pipeline
  // (validate-script).
  return YAML.safeLoad(data) as TestScript;
}

async function addOverrides(
  script: MergedScript,
  flags: ScriptPrepFlags
): Promise<MergedScript> {
  if (!flags.overrides) {
    return script;
  }

  const o: unknown = JSON.parse(flags.overrides);
  const result = _.mergeWith(
    script,
    o,
    function customizer(_objVal, srcVal, _k, _obj, _src, _stack) {
      if (_.isArray(srcVal)) {
        return srcVal;
      } else {
        return undefined;
      }
    }
  );

  return result;
}

async function addVariables(
  script: MergedScript,
  flags: ScriptPrepFlags
): Promise<MergedScript> {
  if (!flags.variables) {
    return script;
  }

  const variables: Record<string, unknown> = JSON.parse(flags.variables);
  const scriptVariables = script.config.variables || {};
  script.config.variables = scriptVariables;
  for (const [k, v] of Object.entries(variables)) {
    scriptVariables[k] = v;
  }

  return script;
}

function addDefaultPlugins(script: MergedScript): MergedScript {
  const finalScript = _.cloneDeep(script);

  if (!script.config.plugins) {
    finalScript.config.plugins = {};
  }

  const additionalPluginsAndOptions = {
    'metrics-by-endpoint': { suppressOutput: true, stripQueryString: true }
  };

  const plugins = finalScript.config.plugins || {};
  finalScript.config.plugins = plugins;
  for (const [pluginName, pluginOptions] of Object.entries(
    additionalPluginsAndOptions
  )) {
    if (!plugins[pluginName]) {
      plugins[pluginName] = pluginOptions;
    }
  }

  return finalScript;
}

async function resolveConfigTemplates(
  script: MergedScript,
  flags: ScriptPrepFlags,
  configPath: string,
  scriptPath: string | undefined
): Promise<MergedScript> {
  const cliVariables = flags.variables ? JSON.parse(flags.variables) : {};

  script.config = engineUtil.template(script.config, {
    vars: {
      $scenarioFile: scriptPath,
      $dirname: path.dirname(configPath),
      $testId: global.artillery.testRunId,
      $processEnvironment: process.env,
      $env: process.env,
      $environment: flags.environment,
      ...cliVariables
    },
    funcs: contextFuncs
  });

  return script;
}

async function checkConfig(
  script: TestScript,
  scriptPath: string,
  flags: ScriptPrepFlags
): Promise<MergedScript> {
  const merged = script as MergedScript;
  merged._environment = flags.environment;
  merged.config = merged.config || {};
  return checkMergedConfig(merged, scriptPath, flags);
}

async function checkMergedConfig(
  script: MergedScript,
  scriptPath: string,
  flags: ScriptPrepFlags
): Promise<MergedScript> {
  if (flags.environment) {
    debug('environment specified: %s', flags.environment);
    if (script.config.environments?.[flags.environment]) {
      _.merge(script.config, script.config.environments[flags.environment]);
    } else {
      // TODO: Emit an event instead
      console.log(
        `WARNING: environment ${flags.environment} is set but is not defined in the script`
      );
    }
  }

  if (flags.target && script.config) {
    script.config.target = flags.target;
  }

  //
  // Override/set config.tls if needed:
  //
  if (flags.insecure) {
    if (script.config.tls) {
      if (script.config.tls.rejectUnauthorized) {
        console.log(
          'WARNING: TLS certificate validation enabled in the ' +
            'test script, but explicitly disabled with ' +
            '-k/--insecure.'
        );
      }
      script.config.tls.rejectUnauthorized = false;
    } else {
      script.config.tls = { rejectUnauthorized: false };
    }
  }

  //
  // Turn config.payload into an array:
  //
  if (_.get(script, 'config.payload')) {
    // Is it an object or an array?
    if (_.isArray(script.config.payload)) {
      // an array - nothing to do
    } else if (_.isObject(script.config.payload)) {
      const payload = script.config.payload as PayloadConfig;
      if (flags.payload && !_.get(payload, 'path')) {
        payload.path = path.resolve(process.cwd(), flags.payload);
      } else if (!flags.payload && !_.get(payload, 'path')) {
        console.log(
          'WARNING: config.payload.path not set and payload file not specified with -p'
        );
      } else if (flags.payload && _.get(payload, 'path')) {
        console.log(
          'WARNING - both -p and config.payload.path are set, config.payload.path will be ignored.'
        );
        payload.path = flags.payload;
      } else {
        // no -p but config.payload.path is set - nothing to do
      }

      // Make it an array
      script.config.payload = [payload];
    } else {
      console.log('Ignoring config.payload, not an object or an array.');
    }
  }

  //
  // Resolve all payload paths to absolute paths now:
  //
  const absoluteScriptPath = path.resolve(process.cwd(), scriptPath);
  _.forEach(script.config.payload as PayloadConfig[], (payloadSpec) => {
    const resolvedPathToPayload = path.resolve(
      path.dirname(absoluteScriptPath),
      payloadSpec.path
    );
    payloadSpec.path = resolvedPathToPayload;
  });
  script._scriptPath = absoluteScriptPath;
  return script;
}

async function resolveConfigPath(
  script: MergedScript,
  flags: ScriptPrepFlags,
  scriptPath: string
): Promise<MergedScript> {
  if (!flags.config) {
    script._configPath = scriptPath;
    return script;
  }

  const absoluteConfigPath = path.resolve(process.cwd(), flags.config);
  script._configPath = absoluteConfigPath;

  if (!script.config.processor) {
    return script;
  }

  const processorPath = path.resolve(
    path.dirname(absoluteConfigPath),
    script.config.processor
  );

  const stats = fs.statSync(processorPath, { throwIfNoEntry: false });

  if (typeof stats === 'undefined') {
    // No file at that path - backwards compatibility mode:
    console.log(
      'WARNING - config.processor is now resolved relative to the config file'
    );
    console.log('Expected to find file at:', processorPath);
  } else {
    script.config.processor = processorPath;
  }

  return script;
}

function formatDuration(durationInMs: number): string {
  const duration = moment.duration(durationInMs);

  const days = duration.days();
  const hours = duration.hours();
  const minutes = duration.minutes();
  const seconds = duration.seconds();

  const timeComponents: string[] = [];
  if (days) {
    timeComponents.push(`${days} ${maybePluralize(days, 'day')}`);
  }

  if (hours || days) {
    timeComponents.push(`${hours} ${maybePluralize(hours, 'hour')}`);
  }

  if (minutes || hours || days) {
    timeComponents.push(`${minutes} ${maybePluralize(minutes, 'minute')}`);
  }

  timeComponents.push(`${seconds} ${maybePluralize(seconds, 'second')}`);

  return timeComponents.join(', ');
}

function maybePluralize(
  amount: number,
  singular: string,
  plural = `${singular}s`
): string {
  return amount === 1 ? singular : plural;
}

function padded(
  str1: string,
  str2: string | number,
  length = 79,
  formatPadding: (s: string) => string = chalk.gray
): string {
  const truncated = maybeTruncate(str1, length);
  return (
    truncated +
    ' ' +
    formatPadding('.'.repeat(length - truncated.length)) +
    ' ' +
    str2
  );
}

function maybeTruncate(str: string, length: number): string {
  return str.length > length ? `${str.slice(0, length - 3)}...` : str;
}

function rainbow(str: string): string {
  const letters = str.split('');
  const colors = [
    chalk.red,
    chalk.yellow,
    chalk.green,
    chalk.cyan,
    chalk.blue,
    chalk.magenta
  ];
  const colorsCount = colors.length;

  return letters
    .map((l, i) => {
      return colors[i % colorsCount](l);
    })
    .join('');
}
