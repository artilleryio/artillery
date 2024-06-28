'use strict';

const fs = require('fs');
const path = require('path');
const YAML = require('js-yaml');
const debug = require('debug')('util');
const moment = require('moment');
const _ = require('lodash');

const chalk = require('chalk');

const engineUtil = require('@artilleryio/int-commons').engine_util;
const renderVariables = engineUtil._renderVariables;
const template = engineUtil.template;
const { contextFuncs } = require('@artilleryio/int-core').runner;

const p = require('util').promisify;

module.exports = {
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

async function readScript(scriptPath) {
  const data = p(fs.readFile)(scriptPath, 'utf-8');
  return data;
}

async function parseScript(data) {
  return YAML.safeLoad(data);
}

async function addOverrides(script, flags) {
  if (!flags.overrides) {
    return script;
  }

  const o = JSON.parse(flags.overrides);
  const result = _.mergeWith(
    script,
    o,
    function customizer(objVal, srcVal, k, obj, src, stack) {
      if (_.isArray(srcVal)) {
        return srcVal;
      } else {
        return undefined;
      }
    }
  );

  return result;
}

async function addVariables(script, flags) {
  if (!flags.variables) {
    return script;
  }

  const variables = JSON.parse(flags.variables);
  script.config.variables = script.config.variables || {};
  for (const [k, v] of Object.entries(variables)) {
    script.config.variables[k] = v;
  }

  return script;
}

function addDefaultPlugins(script) {
  const finalScript = _.cloneDeep(script);

  if (!script.config.plugins) {
    finalScript.config.plugins = {};
  }

  const additionalPluginsAndOptions = {
    'metrics-by-endpoint': { suppressOutput: true, stripQueryString: true }
  };

  for (const [pluginName, pluginOptions] of Object.entries(
    additionalPluginsAndOptions
  )) {
    if (!finalScript.config.plugins[pluginName]) {
      finalScript.config.plugins[pluginName] = pluginOptions;
    }
  }

  return finalScript;
}

async function resolveConfigTemplates(script, flags, configPath, scriptPath) {
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

async function checkConfig(script, scriptPath, flags) {
  script._environment = flags.environment;
  script.config = script.config || {};

  if (flags.environment) {
    debug('environment specified: %s', flags.environment);
    if (
      script.config.environments &&
      script.config.environments[flags.environment]
    ) {
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
      if (flags.payload && !_.get(script.config.payload, 'path')) {
        script.config.payload.path = path.resolve(process.cwd(), flags.payload);
      } else if (!flags.payload && !_.get(script.config.payload, 'path')) {
        console.log(
          'WARNING: config.payload.path not set and payload file not specified with -p'
        );
      } else if (flags.payload && _.get(script.config.payload, 'path')) {
        console.log(
          'WARNING - both -p and config.payload.path are set, config.payload.path will be ignored.'
        );
        script.config.payload.path = flags.payload;
      } else {
        // no -p but config.payload.path is set - nothing to do
      }

      // Make it an array
      script.config.payload = [script.config.payload];
    } else {
      console.log('Ignoring config.payload, not an object or an array.');
    }
  }

  //
  // Resolve all payload paths to absolute paths now:
  //
  const absoluteScriptPath = path.resolve(process.cwd(), scriptPath);
  _.forEach(script.config.payload, function (payloadSpec) {
    const resolvedPathToPayload = path.resolve(
      path.dirname(absoluteScriptPath),
      payloadSpec.path
    );
    payloadSpec.path = resolvedPathToPayload;
  });
  script._scriptPath = absoluteScriptPath;
  return script;
}

async function resolveConfigPath(script, flags, scriptPath) {
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

function formatDuration(durationInMs) {
  const duration = moment.duration(durationInMs);

  const days = duration.days();
  const hours = duration.hours();
  const minutes = duration.minutes();
  const seconds = duration.seconds();

  const timeComponents = [];
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

function maybePluralize(amount, singular, plural = `${singular}s`) {
  return amount === 1 ? singular : plural;
}

function padded(str1, str2, length = 79, formatPadding = chalk.gray) {
  const truncated = maybeTruncate(str1, length);
  return (
    truncated +
    ' ' +
    formatPadding('.'.repeat(length - truncated.length)) +
    ' ' +
    str2
  );
}

function maybeTruncate(str, length) {
  return str.length > length ? str.slice(0, length - 3) + '...' : str;
}

function rainbow(str) {
  const letters = str.split('');
  const colors = ['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'];
  const colorsCount = colors.length;

  return letters
    .map((l, i) => {
      const color = colors[i % colorsCount];
      return chalk[color](l);
    })
    .join('');
}
