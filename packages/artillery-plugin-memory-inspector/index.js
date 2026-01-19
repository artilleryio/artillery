const pidusage = require('pidusage');
const debug = require('debug')('plugin:memory-inspector');

const fromBytesToUnit = (value, unit) => {
  const allowedUnits = {
    kb: ['kb', 'kilobyte'],
    mb: ['mb', 'megabyte']
  };

  if (!unit) {
    debug('No unit specified. Defaulting to mb.');
    return value / 1024 / 1024;
  }

  if (allowedUnits.kb.includes(unit)) {
    return value / 1024;
  }

  if (allowedUnits.mb.includes(unit)) {
    return value / 1024 / 1024;
  }

  debug(`Unit ${unit} is not an allowed unit! Defaulting to mb`);
  return value / 1024 / 1024;
};

function ArtilleryPluginMemoryInspector(script, events) {
  this.script = script;
  this.events = events;

  const inspectorConfig =
    script.config['memory-inspector'] ||
    script.config.plugins['memory-inspector'];

  async function memoryInspectorHandler(_context, ee, _next) {
    if (typeof process.env.ARTILLERY_INTROSPECT_MEMORY !== 'undefined') {
      //https://nodejs.org/api/process.html#processmemoryusage
      const { rss, heapUsed, heapTotal, external } = process.memoryUsage();
      ee.emit(
        'histogram',
        'artillery_internal.memory',
        fromBytesToUnit(rss, 'mb')
      );
      ee.emit(
        'histogram',
        'artillery_internal.external',
        fromBytesToUnit(external, 'mb')
      );
      ee.emit(
        'histogram',
        'artillery_internal.heap_used',
        fromBytesToUnit(heapUsed, 'mb')
      );
      ee.emit(
        'histogram',
        'artillery_internal.heap_total',
        fromBytesToUnit(heapTotal, 'mb')
      );
    }

    for (const { pid, name, unit } of inspectorConfig) {
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
          fromBytesToUnit(stats.memory, unit)
        );
      } catch (error) {
        debug(`Could not get usage stats for pid ${pid}.\n${error}`);
      }
    }
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
