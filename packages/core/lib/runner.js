/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const EventEmitter = require('eventemitter3');
const path = require('path');
const _ = require('lodash');
const debug = require('debug')('runner');
const debugPerf = require('debug')('perf');
const uuidv4 = require('uuid').v4;
const { SSMS } = require('./ssms');
const createPhaser = require('./phases');
const createReader = require('./readers');
const engineUtil = require('@artilleryio/int-commons').engine_util;
const wl = require('./weighted-pick');
const { pathToFileURL } = require('url');

const Engines = {
  http: require('./engine_http'),
  ws: require('./engine_ws'),
  socketio: require('./engine_socketio')
};

module.exports = {
  runner: runner,
  contextFuncs: {
    $randomString,
    $randomNumber
  },
  runnerFuncs: {
    handleScriptHook,
    prepareScript,
    loadProcessor
  }
};

function loadEngines(
  script,
  ee,
  warnings = {
    engines: {}
  }
) {
  const loadedEngines = _.map(
    Object.assign({}, Engines, script.config.engines),
    function loadEngine(engineConfig, engineName) {
      let moduleName = 'artillery-engine-' + engineName;
      try {
        let Engine;
        if (typeof Engines[engineName] !== 'undefined') {
          Engine = Engines[engineName];
        } else {
          Engine = require(moduleName);
        }
        const engine = new Engine(script, ee, engineUtil);
        engine.__name = engineName;
        return engine;
      } catch (err) {
        console.log(
          'WARNING: engine %s specified but module %s could not be loaded',
          engineName,
          moduleName
        );
        console.log(err.stack);
        warnings.engines[engineName] = {
          message: 'Could not load',
          error: err
        };
      }
    }
  );

  return { loadedEngines, warnings };
}

async function loadProcessor(script, options) {
  const absoluteScriptPath = path.resolve(process.cwd(), options.scriptPath);
  if (script.config.processor) {
    const processorPath = path.resolve(
      path.dirname(absoluteScriptPath),
      script.config.processor
    );

    if (processorPath.endsWith('.mjs')) {
      const fileUrl = pathToFileURL(processorPath);
      const exports = await import(fileUrl.href);
      script.config.processor = Object.assign(
        {},
        script.config.processor,
        exports
      );
    } else {
      // CJS (possibly transplied from TS)
      script.config.processor = require(processorPath);
    }
  }

  return script;
}

function prepareScript(script, payload) {
  const runnableScript = _.cloneDeep(script);

  _.each(runnableScript.config.phases, function (phaseSpec) {
    phaseSpec.mode = phaseSpec.mode || runnableScript.config.mode;
  });

  if (payload) {
    if (_.isArray(payload[0])) {
      runnableScript.config.payload = [
        {
          fields: runnableScript.config.payload.fields,
          reader: createReader(
            runnableScript.config.payload.order,
            runnableScript.config.payload
          ),
          data: payload
        }
      ];
    } else {
      runnableScript.config.payload = payload;
      _.each(runnableScript.config.payload, function (el) {
        el.reader = createReader(el.order, el);
      });
    }
  } else {
    runnableScript.config.payload = null;
  }

  // Flatten flows (can have nested arrays of request specs with YAML references):
  _.each(runnableScript.scenarios, function (scenarioSpec) {
    scenarioSpec.flow = _.flatten(scenarioSpec.flow);
  });

  return runnableScript;
}

async function runner(script, payload, options, callback) {
  let opts = _.assign(
    {
      periodicStats: script.config.statsInterval || 30,
      mode: script.config.mode || 'uniform'
    },
    options
  );

  const metrics = new SSMS();

  const warnings = {
    engines: {}
  };

  const runnableScript = prepareScript(script, payload);

  let ee = new EventEmitter();

  //
  // load engines:
  //
  const { loadedEngines: runnerEngines } = loadEngines(
    runnableScript,
    ee,
    warnings
  );

  const promise = new Promise(function (resolve, reject) {
    ee.run = function (contextVars) {
      let runState = {
        pendingScenarios: 0,
        // pendingRequests: 0,
        compiledScenarios: null,
        scenarioEvents: null,
        picker: undefined,
        engines: runnerEngines,
        metrics: metrics
      };
      debug('run() with: %j', runnableScript);
      run(runnableScript, ee, opts, runState, contextVars);
    };

    ee.stop = async function (done) {
      metrics.stop();
    };

    // FIXME: Warnings should be returned from this function instead along with
    // the event emitter. That will be a breaking change.
    ee.warnings = warnings;

    resolve(ee);
  });

  if (callback && typeof callback === 'function') {
    promise.then(callback.bind(null, null), callback);
  }

  return promise;
}

function run(script, ee, options, runState, contextVars) {
  const metrics = runState.metrics;
  const intermediates = [];

  let phaser = createPhaser(script.config.phases);
  let scenarioContext;

  phaser.on('arrival', function (spec) {
    if (runState.pendingScenarios >= spec.maxVusers) {
      metrics.counter('vusers.skipped', 1);
    } else {
      scenarioContext = runScenario(
        script,
        metrics,
        runState,
        contextVars,
        options
      );
    }
  });
  phaser.on('phaseStarted', function (spec) {
    ee.emit('phaseStarted', spec);
  });
  phaser.on('phaseCompleted', function (spec) {
    ee.emit('phaseCompleted', spec);
  });
  phaser.on('done', function () {
    debug('All phases launched');

    const doneYet = setInterval(function checkIfDone() {
      if (runState.pendingScenarios === 0) {
        clearInterval(doneYet);

        metrics.aggregate(true);

        const totals = SSMS.pack(intermediates);

        ee.emit('done', totals);
      } else {
        debug('Pending scenarios: %s', runState.pendingScenarios);
      }
    }, 1000);
  });

  metrics.on('metricData', (ts, periodData) => {
    const cloned = SSMS.deserializeMetrics(SSMS.serializeMetrics(periodData));
    intermediates.push(periodData);
    ee.emit('stats', cloned);
  });

  phaser.run();
}

function runScenario(script, metrics, runState, contextVars, options) {
  const start = process.hrtime();

  //
  // Compile scenarios if needed
  //
  if (!runState.compiledScenarios) {
    _.each(script.scenarios, function (scenario) {
      if (typeof scenario.weight === 'undefined') {
        scenario.weight = 1;
      } else {
        debug(`scenario ${scenario.name} weight = ${scenario.weight}`);
        const variableValues = Object.assign(
          datafileVariables(script),
          inlineVariables(script),
          { $processEnvironment: process.env }
        );

        const w = engineUtil.template(scenario.weight, {
          vars: variableValues
        });
        scenario.weight = isNaN(parseInt(w)) ? 0 : parseInt(w); //eslint-disable-line radix
        debug(
          `scenario ${scenario.name} weight has been set to ${scenario.weight}`
        );
      }
    });

    runState.picker = wl(script.scenarios);

    runState.scenarioEvents = new EventEmitter();
    runState.scenarioEvents.on('counter', function (name, value) {
      metrics.counter(name, value);
    });
    // TODO: Deprecate
    runState.scenarioEvents.on('customStat', function (stat) {
      metrics.summary(stat.stat, stat.value);
    });
    runState.scenarioEvents.on('summary', function (name, value) {
      metrics.summary(name, value);
    });
    runState.scenarioEvents.on('histogram', function (name, value) {
      metrics.summary(name, value);
    });
    runState.scenarioEvents.on('rate', function (name) {
      metrics.rate(name);
    });
    runState.scenarioEvents.on('started', function () {
      runState.pendingScenarios++;
    });
    // TODO: Take an object so that it can have code, description etc
    runState.scenarioEvents.on('error', function (errCode) {
      metrics.counter(`errors.${errCode}`, 1);
    });

    runState.compiledScenarios = _.map(
      script.scenarios,
      function (scenarioSpec, scenarioIndex) {
        const name = scenarioSpec.engine || script.config.engine || 'http';
        const engine = runState.engines.find((e) => e.__name === name);

        if (typeof engine === 'undefined') {
          const scenarioNameOrIndex = scenarioSpec.name || scenarioIndex;
          throw new Error(
            `Failed to run scenario "${scenarioNameOrIndex}": unknown engine "${name}". Did you forget to include it in "config.engines.${name}"?`
          );
        }

        return engine.createScenario(scenarioSpec, runState.scenarioEvents);
      }
    );
  }

  //default to weighted picked scenario
  let i = runState.picker()[0];

  if (options.scenarioName) {
    let foundIndex;
    const foundScenario = script.scenarios.filter((scenario, index) => {
      const hasScenarioByRegex = new RegExp(options.scenarioName).test(
        scenario.name
      );
      const hasScenarioByName = scenario.name === options.scenarioName;
      const hasScenario = hasScenarioByName || hasScenarioByRegex;

      if (hasScenario) {
        foundIndex = index;
      }

      return hasScenario;
    });

    if (foundScenario?.length === 0) {
      throw new Error(
        `Scenario ${options.scenarioName} not found in script. Make sure your chosen scenario matches the one in your script exactly.`
      );
    } else if (foundScenario.length > 1) {
      throw new Error(
        `Multiple scenarios for ${options.scenarioName} found in script. Make sure you give unique names to your scenarios in your script.`
      );
    } else {
      debug(`Scenario ${options.scenarioName} found in script. running it!`);
      i = foundIndex;
    }
  }
  debug(
    'picking scenario %s (%s) weight = %s',
    i,
    script.scenarios[i].name,
    script.scenarios[i].weight
  );

  metrics.counter(`vusers.created_by_name.${script.scenarios[i].name || i}`, 1);
  metrics.counter('vusers.created', 1);

  const scenarioStartedAt = process.hrtime();
  const scenarioContext = createContext(script, contextVars, {
    scenario: script.scenarios[i]
  });

  const finish = process.hrtime(start);
  const runScenarioDelta = finish[0] * 1e9 + finish[1];
  debugPerf(
    'runScenarioDelta: %s',
    Math.round((runScenarioDelta / 1e6) * 100) / 100
  );
  runState.compiledScenarios[i](scenarioContext, function (err, context) {
    runState.pendingScenarios--;
    if (err) {
      debug(err);
      metrics.counter('vusers.failed', 1);
    } else {
      metrics.counter('vusers.failed', 0);
      metrics.counter('vusers.completed', 1);
      const scenarioFinishedAt = process.hrtime(scenarioStartedAt);
      const delta = scenarioFinishedAt[0] * 1e9 + scenarioFinishedAt[1];
      metrics.summary('vusers.session_length', delta / 1e6);
    }
  });

  return scenarioContext;
}

function datafileVariables(script) {
  let result = {};
  if (script.config.payload) {
    _.each(script.config.payload, function (el) {
      if (!el.loadAll) {
        // Load individual fields from the CSV into VU context variables
        // If data = [] (i.e. the CSV file is empty, or only has headers and
        // skipHeaders = true), then row could = undefined
        let row = el.reader(el.data) || [];
        _.each(el.fields, function (fieldName, j) {
          result[fieldName] = row[j];
        });
      } else {
        if (typeof el.name !== 'undefined') {
          // Make the entire CSV available
          result[el.name] = el.reader(el.data);
        } else {
          console.log(
            'WARNING: loadAll is set to true but no name is provided for the CSV data'
          );
        }
      }
    });
  }

  return result;
}

function inlineVariables(script) {
  let result = {};
  if (script.config.variables) {
    _.each(script.config.variables, function (v, k) {
      let val;
      if (_.isArray(v)) {
        val = _.sample(v);
      } else {
        val = v;
      }
      result[k] = val;
    });
  }
  return result;
}

/**
 * Create initial context for a scenario.
 */
function createContext(script, contextVars, additionalProperties = {}) {
  //allow for additional properties to be passed in, but not override vars and funcs
  const additionalPropertiesWithoutOverride = _.omit(additionalProperties, [
    'vars',
    'funcs'
  ]);

  const INITIAL_CONTEXT = {
    vars: Object.assign(
      {
        target: script.config.target,
        $environment: script._environment,
        $processEnvironment: process.env, // TODO: deprecate
        $env: process.env,
        $testId: global.artillery.testRunId
      },
      contextVars || {}
    ),
    funcs: {
      $randomNumber: $randomNumber,
      $randomString: $randomString,
      $template: (input) => engineUtil.template(input, { vars: result.vars })
    },
    ...additionalPropertiesWithoutOverride
  };

  if (script._configPath) {
    INITIAL_CONTEXT.vars.$dirname = path.dirname(script._configPath);
  }
  if (script._scriptPath) {
    INITIAL_CONTEXT.vars.$scenarioFile = script._scriptPath;
  }
  let result = INITIAL_CONTEXT;

  // variables from payloads:
  const variableValues1 = datafileVariables(script);
  Object.assign(result.vars, variableValues1);
  // inline variables:
  const variableValues2 = inlineVariables(script);
  Object.assign(result.vars, variableValues2);

  result._uid = uuidv4();
  result.vars.$uuid = result._uid;

  return result;
}

//
// Generator functions for template strings:
//
function $randomNumber(min, max) {
  return _.random(min, max);
}

function $randomString(length = 10) {
  let s = '';
  const alphabet =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const alphabetLength = alphabet.length;

  while (s.length < length) {
    s += alphabet.charAt((Math.random() * alphabetLength) | 0);
  }

  return s;
}

function handleScriptHook(hook, script, hookEvents, contextVars = {}) {
  if (!script[hook]) {
    return {};
  }

  const { loadedEngines: engines } = loadEngines(script, hookEvents);
  const ee = new EventEmitter();

  return new Promise(function (resolve, reject) {
    ee.on('request', function () {
      hookEvents.emit(`${hook}TestRequest`);
    });
    ee.on('error', function (error) {
      hookEvents.emit(`${hook}TestError`, error);
    });

    const name = script[hook].engine || 'http';
    const engine = engines.find((e) => e.__name === name);

    if (typeof engine === 'undefined') {
      throw new Error(
        `Failed to run ${hook} hook: unknown engine "${name}". Did you forget to include it in "config.engines.${name}"?`
      );
    }
    const hookScenario = engine.createScenario(script[hook], ee);
    const hookContext = createContext(script, contextVars, {
      scenario: script[hook]
    });

    hookScenario(hookContext, function (err, context) {
      if (err) {
        debug(err);
        return reject(err);
      } else {
        return resolve(context.vars);
      }
    });
  });
}
