/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const EventEmitter = require('events').EventEmitter;
const _ = require('lodash');
const debug = require('debug')('runner');
const debugPerf = require('debug')('perf');
const uuid = require('node-uuid');
const Stats = require('./stats2');
const JSCK = require('jsck');
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
  validate: validate
};

function validate(script) {
  let validation = schema.validate(script);
  return validation;
}

function runner(script, payload, options) {
  let opts = _.assign({
    periodicStats: script.config.statsInterval || 10,
    mode: script.config.mode || 'uniform'
  },
  options);

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

  if (opts.environment) {
    debug('environment specified: %s', opts.environment);
    _.merge(
      runnableScript.config,
      script.config.environments[opts.environment]);
  }


  _.each(runnableScript.scenarios, function(scenarioSpec) {
    // if beforeRequest / afterResponse on scenario is set, make sure it's an array
    if (scenarioSpec.beforeRequest && !_.isArray(scenarioSpec.beforeRequest)) {
      scenarioSpec.beforeRequest = [scenarioSpec.beforeRequest];
    } else {
      scenarioSpec.beforeRequest = [];
    }

    if (scenarioSpec.afterResponse && !_.isArray(scenarioSpec.afterResponse)) {
      scenarioSpec.afterResponse = [scenarioSpec.afterResponse];
    } else {
      scenarioSpec.afterResponse = [];
    }
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
          let engine = new Engine(runnableScript, ee);
          engine.__name = engineName;
          return engine;
        } catch (e) {
          console.log(e);
          console.log(
              'WARNING: engine %s specified but module %s could not be loaded',
              engineName,
              moduleName);
        }
      }
  );

  //
  // load plugins:
  //
  let runnerPlugins = _.map(
      runnableScript.config.plugins,
      function loadPlugin(pluginConfig, pluginName) {
        let moduleName = 'artillery-plugin-' + pluginName;
        try {
          let Plugin = require(moduleName);
          let plugin = new Plugin(runnableScript.config, ee);
          plugin.__name = pluginName;
          return plugin;
        } catch (e) {
          console.log(
              'WARNING: plugin %s specified but module %s could not be loaded',
              pluginName,
              moduleName);
        }
      }
  );

  ee.run = function() {
    let runState = {
      pendingScenarios: 0,
      pendingRequests: 0,
      compiledScenarios: null,
      scenarioEvents: null,
      picker: undefined,
      Report: {
        intermediate: [],
        aggregate: {}
      },
      plugins: runnerPlugins,
      engines: runnerEngines
    };
    debug('run() with: %j', runnableScript);
    run(runnableScript, ee, opts, runState);
  };
  return ee;
}

function run(script, ee, options, runState) {
  let intermediate = Stats.create();
  let aggregate = Stats.create();

  let phaser = createPhaser(script.config.phases);
  phaser.on('arrival', function() {
    runScenario(script, intermediate, aggregate, runState);
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

        runState.Report.aggregate = aggregate.report();
        clearInterval(doneYet);
        clearInterval(periodicStatsTimer);
        intermediate.free();
        aggregate.free();

        //
        // Add plugin reports to the final report
        //
        _.each(runState.plugins, function(plugin) {
          if (typeof plugin.report === 'function') {
            let report = plugin.report();
            if (report) {
              if (report.length) {
                _.each(report, function insertIntermediateReport(a) {
                  if (a.timestamp === 'aggregate') {
                    runState.Report.aggregate[plugin.__name] = a.value;
                  } else {
                    let ir = _.findWhere(
                      runState.Report.intermediate,
                      {timestamp: a.timestamp});
                    ir[plugin.__name] = a.value;
                  }
                });
              } else {
                runState.Report.aggregate[plugin.__name] = report;
              }
            }
          }
        });

        return ee.emit('done', runState.Report);
      } else {
        debug('Pending requests: %s', runState.pendingRequests);
        debug('Pending scenarios: %s', runState.pendingScenarios);
      }
    }, 500);
  });

  const periodicStatsTimer = setInterval(function() {
    const report = intermediate.report();
    report.concurrency = runState.pendingScenarios;
    report.pendingRequests = runState.pendingRequests;
    runState.Report.intermediate.push(report);
    intermediate.reset();
    ee.emit('stats', report);
  }, options.periodicStats * 1000);

  phaser.run();
}

function runScenario(script, intermediate, aggregate, runState) {
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
    runState.scenarioEvents.on('customStat', function(stat) {
      intermediate.addCustomStat(stat.stat, stat.value);
      aggregate.addCustomStat(stat.stat, stat.value);
    });
    runState.scenarioEvents.on('started', function() {
      runState.pendingScenarios++;
    });
    runState.scenarioEvents.on('error', function(errCode) {
      intermediate.addError(errCode);
      aggregate.addError(errCode);
    });
    runState.scenarioEvents.on('request', function() {
      intermediate.newRequest();
      aggregate.newRequest();

      runState.pendingRequests++;
    });
    runState.scenarioEvents.on('match', function() {
      intermediate.addMatch();
      aggregate.addMatch();
    });
    runState.scenarioEvents.on('response', function(delta, code, uid) {
      intermediate.completedRequest();
      intermediate.addLatency(delta);
      intermediate.addCode(code);

      let entry = [Date.now(), uid, delta, code];
      intermediate.addEntry(entry);
      aggregate.addEntry(entry);

      aggregate.completedRequest();
      aggregate.addLatency(delta);
      aggregate.addCode(code);

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

  intermediate.newScenario();
  aggregate.newScenario();

  let i = runState.picker()[0];

  debug('picking scenario %s (%s) weight = %s',
        i,
        script.scenarios[i].name,
        script.scenarios[i].weight);

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
      aggregate.addScenarioLatency(delta);
      intermediate.completedScenario();
      aggregate.completedScenario();
    }
  });
}

/**
 * Create initial context for a scenario.
 */
function createContext(script) {
  const INITIAL_CONTEXT = {
    vars: {
      target: script.config.target
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
