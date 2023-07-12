const { ensurePropertyIsAList } =
  require('@artilleryio/int-commons').engine_util;
const _ = require('lodash');

const returnFlowWithScenarioHooks = (scenarioSpec) => {
  ensurePropertyIsAList(scenarioSpec, 'beforeScenario');
  ensurePropertyIsAList(scenarioSpec, 'afterScenario');

  const beforeScenarioFns = _.map(
    scenarioSpec.beforeScenario,
    function (hookFunctionName) {
      return { function: hookFunctionName };
    }
  );

  const afterScenarioFns = _.map(
    scenarioSpec.afterScenario,
    function (hookFunctionName) {
      return { function: hookFunctionName };
    }
  );

  return beforeScenarioFns.concat(scenarioSpec.flow.concat(afterScenarioFns));
};

const handleFunctionAsStep = (requestSpec, processorConfig, ee, debug) => {
  return function (context, callback) {
    let processFunc = processorConfig[requestSpec.function];
    if (processFunc) {
      return processFunc(context, ee, function (hookErr) {
        return callback(hookErr, context);
      });
    } else {
      debug(`Function "${requestSpec.function}" not defined`);
      debug('processor: %o', processorConfig);
      ee.emit('error', `Undefined function "${requestSpec.function}"`);
      return process.nextTick(function () {
        callback(null, context);
      });
    }
  };
};

module.exports = {
  returnFlowWithScenarioHooks,
  handleFunctionAsStep
};
