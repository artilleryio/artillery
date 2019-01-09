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
  stats: Stats
};

function validate(script) {
  let validation = schema.validate(script);
  return validation;
}

function runner(script, payload, options, callback) {
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
    let Plugin, plugin;

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
      }
    });

    if (!Plugin || !plugin) {
      console.log(
        'WARNING: plugin %s specified but module %s could not be loaded',
        pluginName,
        requireString);
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
      run(runnableScript, ee, opts, runState);
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

function run(script, ee, options, runState) {
  let intermediate = Stats.create();
  let aggregate = [];

  let phaser = createPhaser(script.config.phases);
  phaser.on('arrival', function() {
    runScenario(script, intermediate, runState);
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

function runScenario(script, intermediate, runState) {
  const start = process.hrtime();

  //
  // Compile scenarios if needed
  //
  if (!runState.compiledScenarios) {
    _.each(script.scenarios, function(scenario) {
      if (!scenario.weight) {
        scenario.weight = 1;
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
          const name = scenarioSpec.engine || 'http';
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
  const scenarioContext = createContext(script);
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

/**
 * Create initial context for a scenario.
 */
function createContext(script) {
  const INITIAL_CONTEXT = {
    vars: {
      target: script.config.target,
      $environment: script._environment
    },
    funcs: {
      $randomNumber: $randomNumber,
      $randomString: $randomString
    }
  };
  let result = _.cloneDeep(INITIAL_CONTEXT);

  //
  // variables from payloads
  //
  if (script.config.payload) {
    _.each(script.config.payload, function(el) {
      let row = el.reader(el.data);
      _.each(el.fields, function(fieldName, j) {
        result.vars[fieldName] = row[j];
      });
    });
  }

  //
  // inline variables
  //
  if (script.config.variables) {
    _.each(script.config.variables, function(v, k) {
      let val;
      if (_.isArray(v)) {
        val = _.sample(v);
      } else {
        val = v;
      }
      result.vars[k] = val;
    });
  }
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
