const falso = require('@ngneat/falso');

function ArtilleryPluginFakeData(script, events) {
  this.script = script;
  this.events = events;

  const pluginConfig = script.config['falso'] || script.config.plugins['falso'];

  function falsoHandler(context, ee, next) {
    for (let funcName of Object.keys(falso)) {
      //functions that have the function signature we expect start with rand and aren't == rand (which takes an array
      //e.g. seed,
      if (!funcName.startsWith('rand') && funcName != 'rand') {
        continue;
      }

      //don't add functions that have more than 1 argument, as we only support 1 argument
      //we can look into adding support for more arguments later, but most of the functions available use 1 argument anyway
      if (falso[funcName].length > 1) {
        continue;
      }

      context.funcs[`$${funcName}`] = function () {
        if (pluginConfig[funcName]) {
          return falso[funcName](pluginConfig[funcName]);
        }
        return falso[funcName]();
      };
    }

    next();
  }

  script.scenarios = script.scenarios.map((scenario) => {
    scenario.beforeScenario = [].concat(scenario.beforeScenario || []);
    scenario.beforeScenario.push('falsoHandler');
    return scenario;
  });

  if (!script.config.processor) {
    script.config.processor = {};
  }

  script.config.processor.falsoHandler = falsoHandler;

  return this;
}

module.exports = {
  Plugin: ArtilleryPluginFakeData
};
