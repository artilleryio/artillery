'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');
const YAML = require('js-yaml');
const debug = require('debug')('util');
const moment = require('moment');
const _ = require('lodash');

const chalk = require('chalk');

const engineUtil = require('../core/lib/engine_util');
const renderVariables = engineUtil._renderVariables;
const template = engineUtil.template;
const { contextFuncs } = require('../core/lib/runner');

module.exports = {
  readScript,
  parseScript,
  prepareConfig,
  addOverrides,
  addVariables,
  checkConfig,
  renderVariables,
  template,
  formatDuration,
  rainbow
};

function readScript(scriptPath, callback) {
  fs.readFile(scriptPath, 'utf-8', function(err, data) {
    if (err) {
      const msg = util.format('File not found: %s', scriptPath);
      return callback(new Error(msg), null);
    }

    return callback(null, data, scriptPath);
  });
}

function parseScript(data, scriptPath, callback) {
  let script;

  try {
    script = YAML.safeLoad(data);
  } catch (loadErr) {
    const msg2 = `Could not parse ${scriptPath}: (${loadErr.message})`;
    return callback(new Error(msg2), null);
  }

  return callback(null, script);
}

function prepareConfig(script, scriptPath, options, callback) {
  if (!options.config) {
    return callback(null, script, scriptPath, options);
  }

  fs.readFile(options.config, 'utf-8', function(err, data) {
    if (err) {
      return callback(err, script, scriptPath, options);
    }

    let config;
    try {
      config = YAML.load(data);
    } catch (e) {
      return callback(e, script, scriptPath, options);
    }

    script = _.merge(script, config);

    return callback(null, script, scriptPath, options);
  });
}

function addOverrides(script, scriptPath, options, callback) {
  if (options.overrides) {
    let o = null;

    try {
      o = JSON.parse(options.overrides);
    } catch (err) {}

    if (!o) {
      return callback(
        new Error(
          `Error: The values of --overrides does not seem to be valid JSON.`
        )
      );
    }

    script = _.mergeWith(script, o, function customizer(
      objValue,
      srcValue,
      key,
      object,
      source,
      stack
    ) {
      if (_.isArray(srcValue)) {
        return srcValue;
      } else {
        return undefined;
      }
    });
  }

  return callback(null, script, scriptPath, options);
}

function addVariables(script, scriptPath, options, callback) {
  if (options.variables) {
    let variables = null;
    try {
      variables = JSON.parse(options.variables);
    } catch (parseErr) {
    }

    if (!variables) {
      return callback(
        new Error(
          `Variable definition is not valid JSON. Correct example: -v '{"var1": "value1", "var2": "value2"}'`
        ), script, scriptPath, options
      );
    }

    if (!script.config.variables) {
      script.config.variables = {};
    }

    Object.keys(variables).forEach((varName) => {
      script.config.variables[varName] = variables[varName];
    });
  }

  script.config = engineUtil.template(
    script.config,
    { vars:
      {
        $processEnvironment: process.env,
        $environment: options.environment,
      },
      funcs: contextFuncs
    });

  return callback(null, script, scriptPath, options);
}

function checkConfig(script, scriptPath, options, callback) {
  script._environment = options.environment;

  if (options.environment) {
    debug('environment specified: %s', options.environment);
    if (script.config.environments && script.config.environments[options.environment]) {
      _.merge(script.config, script.config.environments[options.environment]);
    } else {
      console.log(
        `WARNING: environment ${
          options.environment
        } is set but is not defined in the script`
      );
    }
  }

  if (options.target && script.config) {
    script.config.target = options.target;
  }

  if (!script.config.target && !options.environment) {
    const msg4 = 'No target specified and no environment chosen';
    return callback(new Error(msg4), null);
  }

  //
  // Override/set config.tls if needed:
  //
  if (options.insecure) {
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
      if (options.payload && !_.get(script.config.payload, 'path')) {
        script.config.payload.path = path.resolve(
          process.cwd(),
          options.payload
        );
      } else if (!options.payload && !_.get(script.config.payload, 'path')) {
        console.log(
          'WARNING: config.payload.path not set and payload file not specified with -p'
        );
      } else if (options.payload && _.get(script.config.payload, 'path')) {
        console.log(
          'WARNING - both -p and config.payload.path are set, config.payload.path will be ignored.'
        );
        script.config.payload.path = options.payload;
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
  _.forEach(script.config.payload, function(payloadSpec) {
    const absoluteScriptPath = path.resolve(process.cwd(), scriptPath);
    const resolvedPathToPayload = path.resolve(
      path.dirname(absoluteScriptPath),
      payloadSpec.path
    );
    payloadSpec.path = resolvedPathToPayload;
  });

  return callback(null, script);
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

function rainbow(str) {
  const letters = str.split('');
  const colors = ['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'];
  const colorsCount = colors.length;

  return letters.map((l, i) => {
    const color = colors[i % colorsCount];
    return chalk[color](l);
  }).join('');
}
