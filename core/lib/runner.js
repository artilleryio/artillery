/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const EventEmitter = require('events').EventEmitter;
const path = require('path');
const _ = require('lodash');
const debug = require('debug')('runner');
const debugPerf = require('debug')('perf');
const uuid = require('uuid');
const A = require('async');
const Stats = require('./stats2');
const JSCK = require('jsck');
const tryResolve = require('try-require').resolve;
const createPhaser = require('./phases');
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
  stats: Stats,
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
    periodicStats: script.config.statsInterval || 10,
    mode: script.config.mode || 'uniform'
  },
  options);

  let warnings = {
    plugins: {
      // someplugin: {
      //   message: 'Plugin not found',
      //   error: new Error()
      // }
    },
    engines: {
      // see plugins
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
    contextVars = await handleBeforeRequests(script, runnableScript, runnerEngines, ee);
  }

  //
  // load plugins:
  //
  let runnerPlugins = [];
  let requirePaths = [];

  let pro = null;
  if (tryResolve('artillery-pro')) {
    pro = require('artillery-pro');
    requirePaths = requirePaths.concat(pro.getPluginPath());
  } else {
    debug('Artillery Pro is not installed.');
  }

  requirePaths.push('');

  if (process.env.ARTILLERY_PLUGIN_PATH) {
    requirePaths = requirePaths.concat(process.env.ARTILLERY_PLUGIN_PATH.split(':'));
  }

  debug('require paths: ', requirePaths);

  runnableScript.config.plugins = runnableScript.config.plugins || {};

  if (process.env.ARTILLERY_PLUGINS) {
    let additionalPlugins = {};
    try {
      additionalPlugins = JSON.parse(process.env.ARTILLERY_PLUGINS);
    } catch (ignoreErr) {
      debug(ignoreErr);
    }
    runnableScript.config.plugins = Object.assign(
      runnableScript.config.plugins,
      additionalPlugins);
  }

  _.each(runnableScript.config.plugins, function tryToLoadPlugin(pluginConfig, pluginName) {
    let pluginConfigScope = pluginConfig.scope || runnableScript.config.pluginsScope;
    let pluginPrefix = pluginConfigScope ? pluginConfigScope : 'artillery-plugin-';
    let requireString = pluginPrefix + pluginName;
    let Plugin, plugin, pluginErr;

    requirePaths.forEach(function(rp) {
      try {
        Plugin = require(path.join(rp, requireString));
        if (typeof Plugin === 'function') {
          // Plugin interface v1
          plugin = new Plugin(runnableScript.config, ee);
          plugin.__name = pluginName;
        } else if (typeof Plugin === 'object' && typeof Plugin.Plugin === 'function') {
          // Plugin interface 2+
          plugin = new Plugin.Plugin(runnableScript, ee, options);
          plugin.__name = pluginName;
        }
      } catch (err) {
        debug(err);
        pluginErr = err;
      }
    });

    if (!Plugin || !plugin) {
      let msg;

      if (pluginErr.code === 'MODULE_NOT_FOUND') {
        msg = `WARNING: Plugin ${pluginName} specified but module ${requireString} could not be found (${pluginErr.code})`;
      } else {
        msg = `WARNING: Could not initialize plugin ${pluginName} (${pluginErr.message})`;
      }

      console.log(msg);

      warnings.plugins[pluginName] = {
        message: 'Could not load'
      };
    } else {
      debug('Plugin %s loaded from %s', pluginName, requireString);
      runnerPlugins.push(plugin);
    }
  });

  const promise = new Promise(function(resolve, reject) {
    ee.run = function() {
      let runState = {
        pendingScenarios: 0,
        pendingRequests: 0,
        compiledScenarios: null,
        scenarioEvents: null,
        picker: undefined,
        plugins: runnerPlugins,
        engines: runnerEngines
      };
      debug('run() with: %j', runnableScript);
      run(runnableScript, ee, opts, runState, contextVars);
    };

    ee.stop = function (done) {
      // allow plugins to cleanup
      A.eachSeries(
        runnerPlugins,
        function(plugin, next) {
          if (plugin.cleanup) {
            plugin.cleanup(function(err) {
              if (err) {
                debug(err);
              }
              return next();
            });
          } else {
            return next();
          }
        },
        function(err) {
          return done(err);
        });
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
  let intermediate = Stats.create();
  let aggregate = [];

  let phaser = createPhaser(script.config.phases);
  phaser.on('arrival', function (spec) {
    if (runState.pendingScenarios >= spec.maxVusers) {
      intermediate.avoidedScenario();
    } else {
      runScenario(script, intermediate, runState, contextVars);
    }
  });
  phaser.on('phaseStarted', function(spec) {
    ee.emit('phaseStarted', spec);
  });
  phaser.on('phaseCompleted', function(spec) {
    ee.emit('phaseCompleted', spec);
  });
  phaser.on('done', function() {
    debug('All phases launched');

    const doneYet = setInterval(function checkIfDone() {
      if (runState.pendingScenarios === 0) {
        if (runState.pendingRequests !== 0) {
          debug('DONE. Pending requests: %s', runState.pendingRequests);
        }

        clearInterval(doneYet);
        clearInterval(periodicStatsTimer);

        sendStats();

        intermediate.free();

        let aggregateReport = Stats.combine(aggregate).report();
        return ee.emit('done', aggregateReport);
      } else {
        debug('Pending requests: %s', runState.pendingRequests);
        debug('Pending scenarios: %s', runState.pendingScenarios);
      }
    }, 500);
  });

  const periodicStatsTimer = setInterval(sendStats, options.periodicStats * 1000);

  function sendStats() {
    intermediate._concurrency = runState.pendingScenarios;
    intermediate._pendingRequests = runState.pendingRequests;
    ee.emit('stats', intermediate.clone());
    delete intermediate._entries;
    aggregate.push(intermediate.clone());
    intermediate.reset();
  }

  phaser.run();
}

function runScenario(script, intermediate, runState, contextVars) {
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
      intermediate.counter(name, value);
    });
    runState.scenarioEvents.on('histogram', function(name, value) {
      intermediate.addCustomStat(name, value);
    });
    // TODO: Deprecate
    runState.scenarioEvents.on('customStat', function(stat) {
      intermediate.addCustomStat(stat.stat, stat.value);
    });
    runState.scenarioEvents.on('started', function() {
      runState.pendingScenarios++;
    });
    runState.scenarioEvents.on('error', function(errCode) {
      intermediate.addError(errCode);
    });
    runState.scenarioEvents.on('request', function() {
      intermediate.newRequest();

      runState.pendingRequests++;
    });
    runState.scenarioEvents.on('match', function() {
      intermediate.addMatch();
    });
    runState.scenarioEvents.on('response', function(delta, code, uid) {
      intermediate.completedRequest();
      intermediate.addLatency(delta);
      intermediate.addCode(code);

      let entry = [Date.now(), uid, delta, code];
      intermediate.addEntry(entry);

      runState.pendingRequests--;
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

  intermediate.newScenario(script.scenarios[i].name || i);

  const scenarioStartedAt = process.hrtime();
  const scenarioContext = createContext(script, contextVars);

  const finish = process.hrtime(start);
  const runScenarioDelta = (finish[0] * 1e9) + finish[1];
  debugPerf('runScenarioDelta: %s', Math.round(runScenarioDelta / 1e6 * 100) / 100);
  runState.compiledScenarios[i](scenarioContext, function(err, context) {
    runState.pendingScenarios--;
    if (err) {
      debug(err);
    } else {
      const scenarioFinishedAt = process.hrtime(scenarioStartedAt);
      const delta = (scenarioFinishedAt[0] * 1e9) + scenarioFinishedAt[1];
      intermediate.addScenarioLatency(delta);
      intermediate.completedScenario();
    }
  });
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

  let result = _.cloneDeep(INITIAL_CONTEXT);

  // variables from payloads:
  const variableValues1 = datafileVariables(script);
  Object.assign(result.vars, variableValues1);
  // inline variables:
  const variableValues2 = inlineVariables(script);
  Object.assign(result.vars, variableValues2);

  result._uid = uuid.v4();
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

function handleBeforeRequests(script, runnableScript, runnerEngines, testEvents) {
  let ee = new EventEmitter();
  return new Promise(function(resolve, reject){
    ee.on('request', function() {
      testEvents.emit('beforeTestRequest');
    });
    ee.on('error', function(error) {
      testEvents.emit('beforeTestError', error);
    });

    let name = runnableScript.before.engine || 'http';
    let engine = runnerEngines.find((e) => e.__name === name);
    let beforeTestScenario = engine.createScenario(runnableScript.before, ee);
    let beforeTestContext = createContext(script);
    beforeTestScenario(beforeTestContext, function(err, context) {
      if (err) {
        debug(err);
        return reject(err);
      } else {
        return resolve(context.vars);
      }
    });
  });
}
