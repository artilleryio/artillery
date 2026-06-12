const { faker } = require('@faker-js/faker');

// Modules that don't expose simple data-generation functions
const SKIPPED_MODULES = new Set(['helpers', 'definitions', 'rawDefinitions']);

// Deprecated falso-style aliases kept for backwards compatibility.
// Maps legacy `$rand*` names to their faker equivalents (flattened names).
// NOTE: configuration options are NOT translated - options must be provided
// using the faker option shape, under the faker function name.
const DEPRECATED_ALIASES = {
  randEmail: 'internetEmail',
  randFullName: 'personFullName',
  randFirstName: 'personFirstName',
  randLastName: 'personLastName',
  randUserName: 'internetUsername',
  randPassword: 'internetPassword',
  randUuid: 'stringUuid',
  randPhoneNumber: 'phoneNumber',
  randCity: 'locationCity',
  randCountry: 'locationCountry',
  randStreetAddress: 'locationStreetAddress',
  randZipCode: 'locationZipCode',
  randCompanyName: 'companyName',
  randNumber: 'numberInt',
  randBoolean: 'datatypeBoolean',
  randUrl: 'internetUrl',
  randIp: 'internetIpv4',
  randWord: 'loremWord',
  randSentence: 'loremSentence',
  randParagraph: 'loremParagraph',
  randText: 'loremText',
  randJobTitle: 'personJobTitle',
  randColor: 'colorHuman',
  randProductName: 'commerceProductName'
};

const flattenName = (moduleName, functionName) =>
  `${moduleName}${functionName[0].toUpperCase()}${functionName.slice(1)}`;

// Builds a map of flattened function names (e.g. `internetEmail`) to
// zero/one-argument faker functions (e.g. `faker.internet.email`)
const buildFakerFunctionMap = () => {
  const functions = {};

  for (const moduleName of Object.keys(faker)) {
    if (SKIPPED_MODULES.has(moduleName) || moduleName.startsWith('_')) {
      continue;
    }

    const mod = faker[moduleName];
    if (!mod || typeof mod !== 'object') {
      continue;
    }

    // Walk the prototype chain: some faker modules inherit methods
    // (e.g. DateModule extends SimpleDateModule)
    let proto = Object.getPrototypeOf(mod);
    while (proto && proto !== Object.prototype) {
      for (const functionName of Object.getOwnPropertyNames(proto)) {
        if (functionName === 'constructor' || functionName.startsWith('_')) {
          continue;
        }

        if (typeof mod[functionName] !== 'function') {
          continue;
        }

        // Only functions taking at most one argument are supported, as
        // configuration is passed as a single (object) argument
        if (mod[functionName].length > 1) {
          continue;
        }

        const flatName = flattenName(moduleName, functionName);
        if (!functions[flatName]) {
          functions[flatName] = mod[functionName].bind(mod);
        }
      }

      proto = Object.getPrototypeOf(proto);
    }
  }

  return functions;
};

const fakerFunctionMap = buildFakerFunctionMap();

const getFakerFunctions = () => Object.keys(fakerFunctionMap);

const warnedAliases = new Set();

function ArtilleryPluginFakeData(script, events) {
  this.script = script;
  this.events = events;

  const pluginConfig =
    script.config['fake-data'] || script.config.plugins['fake-data'];

  function fakeDataHandler(context, _ee, next) {
    for (const [funcName, fakerFunc] of Object.entries(fakerFunctionMap)) {
      context.funcs[`$${funcName}`] = () => {
        if (pluginConfig[funcName]) {
          return fakerFunc(pluginConfig[funcName]);
        }
        return fakerFunc();
      };
    }

    for (const [aliasName, funcName] of Object.entries(DEPRECATED_ALIASES)) {
      context.funcs[`$${aliasName}`] = () => {
        if (!warnedAliases.has(aliasName)) {
          warnedAliases.add(aliasName);
          console.warn(
            `[fake-data] $${aliasName} is deprecated and will be removed in a future release. Use $${funcName} instead.`
          );
        }

        return context.funcs[`$${funcName}`]();
      };
    }

    next();
  }

  script.scenarios = script.scenarios.map((scenario) => {
    scenario.beforeScenario = [].concat(scenario.beforeScenario || []);
    scenario.beforeScenario.push('fakeDataHandler');
    return scenario;
  });

  if (!script.config.processor) {
    script.config.processor = {};
  }

  script.config.processor.fakeDataHandler = fakeDataHandler;

  return this;
}

module.exports = {
  Plugin: ArtilleryPluginFakeData,
  getFakerFunctions,
  getDeprecatedAliases: () => ({ ...DEPRECATED_ALIASES })
};
