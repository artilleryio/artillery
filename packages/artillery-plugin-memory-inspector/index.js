const pidusage = require('pidusage');
const debug = require('debug')('plugin:memory-inspector');

function ArtilleryPluginMemoryInspector(script, events) {
  this.script = script;
  this.events = events;

  const inspectorConfig =
    script.config['memory-inspector'] ||
    script.config.plugins['memory-inspector'];

  async function memoryInspectorHandler(context, ee, next) {
    if (typeof process.env.ARTILLERY_INTROSPECT_MEMORY !== 'undefined') {
      //https://nodejs.org/api/process.html#processmemoryusage
      const { rss, heapUsed, heapTotal, external } = process.memoryUsage();
      ee.emit('histogram', 'artillery_internal.memory', rss);
      ee.emit('histogram', 'artillery_internal.external', external);
      ee.emit('histogram', 'artillery_internal.heap_used', heapUsed);
      ee.emit('histogram', 'artillery_internal.heap_total', heapTotal);
    }

    for (let { pid, name } of inspectorConfig) {
      if (!pid) {
        debug(`No pid (${pid}) found. Skipping!`);
        continue;
      }
      let stats;
      try {
        stats = await pidusage(pid);

        ee.emit('histogram', `${name || `process_${pid}`}.cpu`, stats.cpu);
        ee.emit(
          'histogram',
          `${name || `process_${pid}`}.memory`,
          stats.memory
        );
      } catch (error) {
        debug(`Could not get usage stats for pid ${pid}.\n${error}`);
        continue;
      }
    }

    return next();
  }

  script.scenarios = script.scenarios.map((scenario) => {
    scenario.beforeScenario = [].concat(scenario.beforeScenario || []);
    scenario.beforeScenario.push('memoryInspectorHandler');
    return scenario;
  });

  if (!script.config.processor) {
    script.config.processor = {};
  }

  script.config.processor.memoryInspectorHandler = memoryInspectorHandler;

  return this;
}

module.exports = {
  Plugin: ArtilleryPluginMemoryInspector
};
