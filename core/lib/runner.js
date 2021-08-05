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
const A = require('async');
const { SSMS } = require('./ssms');
const JSCK = require('jsck');
const tryResolve = require('try-require').resolve;
const createPhaser = require('./phases');
const isIdlePhase = require('./is-idle-phase');
const createReader = require('./readers');
const engineUtil = require('./engine_util');
const wl = require('./weighted-pick');

const Engines = {
  http: {},
  ws: {},
  socketio: {}
};

JSCK.Draft4 = JSCK.draft4;

const schema = new JSCK.Draft4(require('./schemas/artillery_test_script.json'));

module.exports = {
  runner: runner,
  validate: validate,
  contextFuncs: {
    $randomString,
    $randomNumber
  }
};

function validate(script) {
  let validation = schema.validate(script);
  return validation;
}

async function runner(script, payload, options, callback) {
  let opts = _.assign({
    periodicStats: script.config.statsInterval || 30,
    mode: script.config.mode || 'uniform'
  },
  options);

  const metrics = new SSMS();

  let warnings = {
    engines: {
    }
  };

  _.each(script.config.phases, function(phaseSpec) {
    phaseSpec.mode = phaseSpec.mode || script.config.mode;
  });

  if (payload) {
    if (_.isArray(payload[0])) {
      script.config.payload = [
        {
          fields: script.config.payload.fields,
          reader: createReader(script.config.payload.order),
          data: payload
        }
      ];
    } else {
      script.config.payload = payload;
      _.each(script.config.payload, function(el) {
        el.reader = createReader(el.order);
      });
    }
  } else {
    script.config.payload = null;
  }

  let runnableScript = _.cloneDeep(script);

  // Flatten flows (can have nested arrays of request specs with YAML references):
  _.each(runnableScript.scenarios, function(scenarioSpec) {
    scenarioSpec.flow = _.flatten(scenarioSpec.flow);
  });

  let ee = new EventEmitter();

  //
  // load engines:
  //
  let runnerEngines = _.map(
      Object.assign({}, Engines, runnableScript.config.engines),
      function loadEngine(engineConfig, engineName) {
        let moduleName = 'artillery-engine-' + engineName;
        try {
          if (Engines[engineName]) {
            moduleName = './engine_' + engineName;
          }
          let Engine = require(moduleName);
          let engine = new Engine(runnableScript, ee, engineUtil);
          engine.__name = engineName;
          return engine;
        } catch (err) {
          console.log(
              'WARNING: engine %s specified but module %s could not be loaded',
              engineName,
              moduleName);
          console.log(err.stack);
          warnings.engines[engineName] = {
            message: 'Could not load',
            error: err
          };
        }
      }
  );

  //
  // compile and run before script
  //
  let contextVars;
  if (script.before) {
    contextVars = await handleScriptHook('before', runnableScript, runnerEngines, ee, contextVars);
  }

  const promise = new Promise(function(resolve, reject) {
    ee.run = function() {
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
  let scenarioContext

  phaser.on('arrival', function (spec) {
    if (runState.pendingScenarios >= spec.maxVusers) {
      metrics.counter('core.vusers.skipped', 1);
    } else {
      scenarioContext = runScenario(script, metrics, runState, contextVars);
    }
  });
  phaser.on('phaseStarted', function(spec) {
    ee.emit('phaseStarted', spec);
    // if (isIdlePhase(spec)) {
    //   ee.emit('stats', SSMS.empty());
    // }
  });
  phaser.on('phaseCompleted', function(spec) {
    // if (isIdlePhase(spec)) {
    //   ee.emit('stats', SSMS.empty());
    // }
    ee.emit('phaseCompleted', spec);
  });
  phaser.on('done', function() {
    debug('All phases launched');

    const doneYet = setInterval(function checkIfDone() {
      if (runState.pendingScenarios === 0) {
        clearInterval(doneYet);

        metrics.aggregate(true);

        const totals = SSMS.pack(intermediates);

        (async () => {
          if (script.after) {
            //
            // compile and run after script
            //
            await handleScriptHook('after', script, runState.engines, ee, (scenarioContext || {}).vars || contextVars);
          }
          ee.emit('done', totals);
        })();
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

function runScenario(script, metrics, runState, contextVars) {
  const start = process.hrtime();

  //
  // Compile scenarios if needed
  //
  if (!runState.compiledScenarios) {
    _.each(script.scenarios, function(scenario) {
      if (typeof scenario.weight === 'undefined') {
        scenario.weight = 1;
      } else {
        debug(`scenario ${scenario.name} weight = ${scenario.weight}`);
        const variableValues = Object.assign(
          datafileVariables(script),
          inlineVariables(script),
          { $processEnvironment: process.env });

        const w = engineUtil.template(
          scenario.weight,
          { vars: variableValues });
        scenario.weight = isNaN(parseInt(w)) ? 0 : parseInt(w);
        debug(`scenario ${scenario.name} weight has been set to ${scenario.weight}`);
      }
    });

    runState.picker = wl(script.scenarios);

    runState.scenarioEvents = new EventEmitter();
    runState.scenarioEvents.on('counter', function(name, value) {
      metrics.counter(name, value);
    });
    // TODO: Deprecate
    runState.scenarioEvents.on('customStat', function(stat) {
      metrics.summary(stat.stat, stat.value);
    });
    runState.scenarioEvents.on('summary', function(name, value) {
      metrics.summary(name, value);
    });
    runState.scenarioEvents.on('histogram', function(name, value) {
      metrics.summary(name, value);
    });
    runState.scenarioEvents.on('rate', function(name) {
      metrics.rate(name);
    });
    runState.scenarioEvents.on('started', function() {
      runState.pendingScenarios++;
    });
    // TODO: Take an object so that it can have code, description etc
    runState.scenarioEvents.on('error', function(errCode) {
      metrics.counter(`errors.${errCode}`, 1);
    });

    runState.compiledScenarios = _.map(
        script.scenarios,
        function(scenarioSpec) {
          const name = scenarioSpec.engine || script.config.engine || 'http';
          const engine = runState.engines.find((e) => e.__name === name);
          return engine.createScenario(scenarioSpec, runState.scenarioEvents);
        }
    );
  }

  let i = runState.picker()[0];

  debug('picking scenario %s (%s) weight = %s',
        i,
        script.scenarios[i].name,
        script.scenarios[i].weight);

  metrics.counter(`core.vusers.created_by_name.${script.scenarios[i].name || i}`, 1);
  metrics.counter('core.vusers.created.total', 1);

  const scenarioStartedAt = process.hrtime();
  const scenarioContext = createContext(script, contextVars);

  const finish = process.hrtime(start);
  const runScenarioDelta = (finish[0] * 1e9) + finish[1];
  debugPerf('runScenarioDelta: %s', Math.round(runScenarioDelta / 1e6 * 100) / 100);
  runState.compiledScenarios[i](scenarioContext, function(err, context) {
    runState.pendingScenarios--;
    if (err) {
      debug(err);
      metrics.counter('core.vusers.failed', 1);
    } else {
      metrics.counter('core.vusers.completed', 1);
      const scenarioFinishedAt = process.hrtime(scenarioStartedAt);
      const delta = (scenarioFinishedAt[0] * 1e9) + scenarioFinishedAt[1];
      metrics.summary('core.vusers.session_length', delta/1e6);
    }
  });

  return scenarioContext
}

function datafileVariables(script) {
  let result = {};
  if (script.config.payload) {
    _.each(script.config.payload, function(el) {

      // If data = [] (i.e. the CSV file is empty, or only has headers and
      // skipHeaders = true), then row could = undefined
      let row = el.reader(el.data) || [];
      _.each(el.fields, function(fieldName, j) {
        result[fieldName] = row[j];
      });
    });
  }
  return result;
}

function inlineVariables(script) {
  let result = {};
  if (script.config.variables) {
    _.each(script.config.variables, function(v, k) {
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
function createContext(script, contextVars) {
  const INITIAL_CONTEXT = {
    vars: Object.assign(
      {
        target: script.config.target,
        $environment: script._environment,
        $processEnvironment: process.env
      },
      contextVars || {}),
    funcs: {
      $randomNumber: $randomNumber,
      $randomString: $randomString,
      $template: input => engineUtil.template(input, { vars: result.vars })
    }
  };

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

function $randomString(length) {
  return Math.random().toString(36).substr(2, length);
}

function handleScriptHook(hook, script, engines, hookEvents, contextVars) {
  let ee = new EventEmitter();
  return new Promise(function(resolve, reject){
    ee.on('request', function() {
      hookEvents.emit(`${hook}TestRequest`);
    });
    ee.on('error', function(error) {
      hookEvents.emit(`${hook}TestError`, error);
    });

    let name = script[hook].engine || 'http';
    let engine = engines.find((e) => e.__name === name);
    let hookScenario = engine.createScenario(script[hook], ee);
    let hookContext = createContext(script, contextVars);
    hookScenario(hookContext, function(err, context) {
      if (err) {
        debug(err);
        return reject(err);
      } else {
        return resolve(context.vars);
      }
    });
  });
}
